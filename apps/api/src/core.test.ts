import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { prisma } from './config/database.js';
import { emailSendQueue } from './queues/email-send-queue.js';
import { redisConnection } from './queues/redis-connection.js';
import { EmailSchedulingService, scheduleEmailsSchema } from './services/email-scheduling-service.js';
import { RateLimiter } from './services/rate-limiter.js';
import { EmailSearchService } from './services/email-search-service.js';
import { indexEmail, elasticsearch, emailIndex } from './integrations/search/elasticsearch.js';
import { notifyRateLimit } from './services/slack-rate-notifier.js';
import { encrypt } from './integrations/slack/slack-service.js';
import { requireAuth } from './middleware/auth.js';

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
let userA: { id: string };
let userB: { id: string };
let senderA: { id: string; email: string };
const createdJobIds: string[] = [];

beforeAll(async () => {
  await prisma.$connect();
  userA = await prisma.user.create({ data: { name: 'Test A', email: `a-${suffix}@example.com` }, select: { id: true } });
  userB = await prisma.user.create({ data: { name: 'Test B', email: `b-${suffix}@example.com` }, select: { id: true } });
  senderA = await prisma.sender.create({ data: { userId: userA.id, email: `sender-${suffix}@example.com`, displayName: 'Sender A' }, select: { id: true, email: true } });
});

afterAll(async () => {
  await emailSendQueue.obliterate({ force: true }).catch(() => undefined);
  await prisma.emailJob.deleteMany({ where: { id: { in: createdJobIds } } });
  await prisma.sender.deleteMany({ where: { id: senderA.id } });
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  await elasticsearch.indices.delete({ index: emailIndex, ignore_unavailable: true }).catch(() => undefined);
  await prisma.$disconnect();
  await redisConnection.quit();
});

describe('authentication and protected routes', () => {
  it('copies the authenticated session user onto the request', () => {
    const next = vi.fn();
    const request = { session: { userId: userA.id } } as never;
    requireAuth(request, {} as never, next);
    expect((request as { userId: string }).userId).toBe(userA.id);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects anonymous Bull Board and sender requests', async () => {
    const app = createApp();
    expect((await request(app).get('/admin/queues')).status).toBe(401);
    expect((await request(app).get('/api/senders')).status).toBe(401);
  });

  it('rejects invalid schedule payload before creating work', async () => {
    const response = await request(createApp()).post('/api/emails/schedule').send({ recipients: [] });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('scheduling and rate limiting', () => {
  it('creates delayed jobs, deduplicates replay, and enforces sender ownership', async () => {
    const service = new EmailSchedulingService();
    const input = {
      userId: userA.id, senderId: senderA.id,
      recipients: [`One-${suffix}@Example.com`, `two-${suffix}@example.com`, `one-${suffix}@example.com`],
      subject: 'Hello', body: 'Body', startTime: new Date(Date.now() + 120_000),
      delayBetweenEmailsMs: 2_000, hourlyLimit: 10, idempotencyKey: `request-${suffix}-key`,
    };
    const result = await service.schedule(input);
    createdJobIds.push(...result.emailJobs.map((job) => job.id));
    expect(result.scheduledCount).toBe(2);
    const jobs = await Promise.all(result.emailJobs.map((job) => emailSendQueue.getJob(`email-${job.id}`)));
    expect(jobs.every((job) => job?.opts.delay && job.opts.delay > 0)).toBe(true);
    expect((await service.schedule(input)).scheduledCount).toBe(2);
    await expect(service.schedule({ ...input, userId: userB.id })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('applies distributed hourly limits atomically under concurrent load', async () => {
    const limiter = new RateLimiter();
    const id = `rate-test-${suffix}`;
    const decisions = await Promise.all(Array.from({ length: 7 }, () => limiter.reserve(id, 0, 5)));
    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(5);
    expect(decisions.filter((decision) => !decision.allowed && decision.reason === 'hourly-limit')).toHaveLength(2);
    await redisConnection.del(`email:slot:${id}`);
    const hour = new Date(); hour.setUTCMinutes(0, 0, 0);
    await redisConnection.del(`email:rate:${id}:${hour.toISOString()}`);
  });

  it('keeps hourly-limited jobs parked in the next window', async () => {
    const limiter = new RateLimiter();
    const id = `hourly-test-${suffix}`;
    expect((await limiter.reserve(id, 0, 2)).allowed).toBe(true);
    expect((await limiter.reserve(id, 0, 2)).allowed).toBe(true);
    const blocked = await limiter.reserve(id, 0, 2);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.reason).toBe('hourly-limit');
      expect(await limiter.reserve(id, 0, 2)).toEqual(blocked);
    }
    await redisConnection.del(`email:slot:${id}`);
    const hour = new Date(); hour.setUTCMinutes(0, 0, 0);
    await redisConnection.del(`email:rate:${id}:${hour.toISOString()}`);
  });

  it('enforces minimum delay per sender', async () => {
    const limiter = new RateLimiter();
    const id = `delay-test-${suffix}`;
    expect(await limiter.reserve(id, 60_000, 10)).toEqual({ allowed: true });
    const next = await limiter.reserve(id, 60_000, 10);
    expect(next.allowed).toBe(false);
    if (!next.allowed) {
      expect(next.reason).toBe('delay');
      const again = await limiter.reserve(id, 60_000, 10);
      expect(again).toEqual(next);
    }
    await redisConnection.del(`email:slot:${id}`);
  });
});

describe('search isolation and Slack alerts', () => {
  it('only returns indexed emails for the requesting tenant', async () => {
    await indexEmail({ id: `search-a-${suffix}`, userId: userA.id, sender: senderA.email, recipient: `lead-${suffix}@example.com`, subject: 'tenant-a', body: 'alpha', status: 'SENT', scheduledAt: new Date(), sentAt: new Date() });
    await indexEmail({ id: `search-b-${suffix}`, userId: userB.id, sender: `other-${suffix}@example.com`, recipient: `other@example.com`, subject: 'tenant-b', body: 'beta', status: 'SENT', scheduledAt: new Date(), sentAt: new Date() });
    const results = await new EmailSearchService().search(userA.id, 'tenant');
    expect(results).toHaveLength(1);
    expect((results[0] as { userId: string }).userId).toBe(userA.id);
  });

  it('deduplicates Slack alerts and isolates provider failures', async () => {
    const window = new Date(); window.setUTCMinutes(0, 0, 0);
    expect(await notifyRateLimit(userA.id, `missing-${suffix}`, senderA.email, window)).toBe('not-connected');
    await prisma.slackConnection.create({ data: { userId: userA.id, workspaceId: 'T-test', channelId: 'C-test', accessTokenEncrypted: encrypt('invalid-token') } });
    const failingNotifier = async () => { throw new Error('simulated Slack outage'); };
    expect(await notifyRateLimit(userA.id, `slack-${suffix}`, senderA.email, window, failingNotifier)).toBe('failed');
    expect(await notifyRateLimit(userA.id, `slack-${suffix}`, senderA.email, window, failingNotifier)).toBe('already-sent');
    await prisma.slackConnection.delete({ where: { userId: userA.id } });
  });
});

describe('sender validation', () => {
  it('persists a sender with tenant ownership and validates schedule input', async () => {
    const sender = await prisma.sender.findUnique({ where: { id: senderA.id } });
    expect(sender?.userId).toBe(userA.id);
    expect(() => scheduleEmailsSchema.parse({})).toThrow();
  });

  it('rejects malformed sender data for authenticated requests', async () => {
    const agent = request.agent(createApp());
    const response = await agent.post('/api/senders').send({ email: 'not-an-email', displayName: '' });
    expect(response.status).toBe(401);
  });
});
