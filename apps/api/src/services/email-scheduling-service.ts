import { createHash } from 'node:crypto';

import { z } from 'zod';

import { prisma } from '../config/database.js';
import { AppError } from '../errors/app-error.js';
import { emailSendQueue } from '../queues/email-send-queue.js';

export const scheduleEmailsSchema = z.object({
  userId: z.string().cuid(),
  senderId: z.string().cuid(),
  recipients: z.array(z.string().trim().email()).min(1).max(10_000),
  subject: z.string().trim().min(1).max(255),
  body: z.string().min(1).max(100_000),
  startTime: z.coerce.date().refine((value) => value.getTime() > Date.now(), {
    message: 'startTime must be in the future.',
  }),
  delayBetweenEmailsMs: z.number().int().min(0).max(86_400_000),
  hourlyLimit: z.number().int().min(1).max(100_000),
  idempotencyKey: z.string().trim().min(16).max(128),
});

export type ScheduleEmailsInput = z.infer<typeof scheduleEmailsSchema>;

const createEmailIdempotencyKey = (requestKey: string, recipient: string) =>
  createHash('sha256').update(`${requestKey}:${recipient}`).digest('hex');

export class EmailSchedulingService {
  public async schedule(input: ScheduleEmailsInput) {
    const recipients = [...new Set(input.recipients.map((recipient) => recipient.toLowerCase()))];

    const sender = await prisma.sender.findFirst({
      where: { id: input.senderId, userId: input.userId, isActive: true },
      select: { id: true },
    });

    if (!sender) {
      throw new AppError(404, 'SENDER_NOT_FOUND', 'Active sender was not found for this user.');
    }

    const emailJobs = await prisma.$transaction(async (transaction) => {
      await transaction.sender.update({
        where: { id: sender.id },
        data: {
          minimumDelayMs: input.delayBetweenEmailsMs,
          hourlyLimit: input.hourlyLimit,
        },
      });

      await transaction.emailJob.createMany({
        data: recipients.map((recipient, index) => ({
          userId: input.userId,
          senderId: sender.id,
          recipient,
          subject: input.subject,
          body: input.body,
          scheduledAt: new Date(input.startTime.getTime() + index * input.delayBetweenEmailsMs),
          idempotencyKey: createEmailIdempotencyKey(input.idempotencyKey, recipient),
        })),
        skipDuplicates: true,
      });

      return transaction.emailJob.findMany({
        where: {
          userId: input.userId,
          idempotencyKey: {
            in: recipients.map((recipient) => createEmailIdempotencyKey(input.idempotencyKey, recipient)),
          },
        },
        orderBy: { scheduledAt: 'asc' },
      });
    });

    for (const emailJob of emailJobs) {
      const bullJob = await emailSendQueue.add(
        'send-email',
        { emailJobId: emailJob.id },
        {
          jobId: `email-${emailJob.id}`,
          delay: Math.max(0, emailJob.scheduledAt.getTime() - Date.now()),
        },
      );

      if (bullJob.id) {
        await prisma.emailJob.update({
          where: { id: emailJob.id },
          data: { bullJobId: bullJob.id },
        });
      }
    }

    return {
      scheduledCount: emailJobs.length,
      emailJobs: emailJobs.map((emailJob) => ({
        id: emailJob.id,
        recipient: emailJob.recipient,
        scheduledAt: emailJob.scheduledAt,
        status: emailJob.status,
      })),
    };
  }
}
