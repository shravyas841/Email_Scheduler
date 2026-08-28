# ReachInbox Email Job Scheduler

Durable email scheduling with Express/TypeScript, PostgreSQL, Redis/BullMQ, Ethereal SMTP, Elasticsearch, Google OAuth, Slack OAuth, and a React/Vite dashboard.

## Local setup

Requirements: Node 20+, Docker Desktop, Google and Slack developer apps, and an Ethereal account. Copy `.env.example` to `.env`, run `npm install`, `docker compose up -d`, run the Prisma migration, then start `npm run dev:api`, `npm run dev:worker`, and `npm run dev:web` in separate terminals.

API is port 4000, frontend 5173, PostgreSQL 5432, Redis 6379, Elasticsearch 9200, and Bull Board `/admin/queues`.

Put credentials in `.env`. Google callback is `/api/auth/google/callback`; Slack callback is `/api/slack/callback`; Ethereal uses the SMTP variables in `.env.example`.

## Architecture

PostgreSQL is the source of truth. Each recipient becomes an idempotent database record and deterministic delayed BullMQ job. Redis persists queue state and atomically coordinates sender spacing/hourly quotas across workers; excess jobs are delayed into the next window. Elasticsearch is an eventual search projection and never controls delivery state.

Workers claim rows transactionally, retry transient SMTP failures, record attempts, and isolate Elasticsearch/Slack failures. SMTP cannot guarantee exactly-once delivery after a crash between acceptance and database commit; unique idempotency keys and state transitions provide practical protection.

## API

Auth: `/api/auth/google`, `/api/auth/me`, `/api/auth/logout`. Sender: `GET/POST /api/senders`. Email: `POST /api/emails/schedule`, `GET /api/emails/scheduled`, `GET /api/emails/sent`, `GET /api/emails/search`. Slack: `/api/slack/connect`, `/callback`, `/status`, and `POST /disconnect`.

## Known limitations

Google, Slack, and Ethereal require operator credentials for live verification. Express’s default session store is suitable for local development only; production should use a persistent store. See `PRD.md` and `TRD.md` for scope and trade-offs.
