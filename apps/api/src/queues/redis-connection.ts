import { Redis } from 'ioredis';

import { environment } from '../config/environment.js';

export const redisConnection = new Redis(environment.REDIS_URL, {
  maxRetriesPerRequest: null,
});
