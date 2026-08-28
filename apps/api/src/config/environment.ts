import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

dotenv.config({
  path: fileURLToPath(new URL('../../../../.env', import.meta.url)),
  quiet: true,
});

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  throw new Error(`Invalid environment configuration: ${parsedEnvironment.error.message}`);
}

export const environment = parsedEnvironment.data;
