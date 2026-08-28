import { redisConnection } from '../queues/redis-connection.js';

const reserveSlotScript = `
local now = tonumber(ARGV[1])
local delay = tonumber(ARGV[2])
local nextSlot = tonumber(redis.call('GET', KEYS[1]) or '0')
if nextSlot > now then return nextSlot end
redis.call('SET', KEYS[1], now + delay, 'PX', 86400000)
return now
`;

const reserveHourlyScript = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local limit = tonumber(ARGV[1])
if current >= limit then return 0 end
local next = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], 7200)
return next
`;

export type RateDecision = { allowed: true } | { allowed: false; retryAt: number; reason: 'delay' | 'hourly-limit' };

export class RateLimiter {
  public async reserve(senderId: string, minimumDelayMs: number, hourlyLimit: number): Promise<RateDecision> {
    const now = Date.now();
    const slot = Number(await redisConnection.eval(reserveSlotScript, 1, `email:slot:${senderId}`, now, minimumDelayMs));
    if (slot > now) return { allowed: false, retryAt: slot, reason: 'delay' };

    const windowStart = new Date();
    windowStart.setUTCMinutes(0, 0, 0);
    const key = `email:rate:${senderId}:${windowStart.toISOString()}`;
    const count = Number(await redisConnection.eval(reserveHourlyScript, 1, key, hourlyLimit));
    if (count === 0) {
      const nextHour = new Date(windowStart.getTime() + 60 * 60 * 1000).getTime() + 1000;
      return { allowed: false, retryAt: nextHour, reason: 'hourly-limit' };
    }
    return { allowed: true };
  }
}
