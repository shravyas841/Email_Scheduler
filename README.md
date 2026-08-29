# Email Job Scheduler

This is a durable, multi-tenant email scheduler built with Express/TypeScript, PostgreSQL, Redis/BullMQ, Elasticsearch, and a React/Vite dashboard. It expands one scheduling request into one durable job per recipient, enforces sender-level spacing and hourly quotas across workers, and records delivery history.

## Run locally

Requirements: Node 20+, Docker Desktop, and (for live OAuth/email checks) Google, Slack, and Ethereal credentials.

```powershell
Copy-Item .env.example .env
npm install
docker compose up -d
npm run prisma:deploy
npm run dev:api       # terminal 1
npm run dev:worker    # terminal 2
npm run dev:web       # terminal 3
```

The API is at `http://localhost:4000`, the dashboard at `http://localhost:5173`, and Bull Board at `http://localhost:4000/admin/queues`. PostgreSQL, Redis, and Elasticsearch use ports 5432, 6379, and 9200. `npm run test` runs the deterministic API suite against the local containers; `npm run build` builds both workspaces.

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, callback URLs, and SMTP values in `.env` for live integrations. OAuth callback URLs are `/api/auth/google/callback` and `/api/slack/callback`.

## Design

PostgreSQL is the source of truth for users, senders, email jobs, attempts, and Slack connections. Each recipient gets a unique idempotency key and deterministic BullMQ job ID (`email-<emailJobId>`). Redis stores durable BullMQ state and uses Lua scripts for atomic minimum-delay slots and UTC hourly counters; a job that hits a quota is moved to the next available time. Elasticsearch is an eventually consistent, user-filtered search projection and never controls delivery state.

Workers claim `SCHEDULED` rows transactionally, retry transient SMTP failures, record attempts, and isolate Slack/Elasticsearch failures. There is no cron or polling scheduler. Docker named volumes keep PostgreSQL, Redis append-only data, and Elasticsearch data across container restarts.

## Requirement / evidence matrix

| Requirement | Status and evidence |
| --- | --- |
| Durable PostgreSQL persistence | **Implemented and locally verified** — Prisma schema/migration and restart-safe Docker volume. |
| Redis/BullMQ delayed scheduling | **Implemented and locally verified** — queue creation and delayed-job assertions in `apps/api/src/core.test.ts`. |
| Minimum inter-email delay | **Implemented and locally verified** — atomic Redis slot test. |
| Distributed hourly sender limit | **Implemented and locally verified** — concurrent atomic-counter test and rescheduling path. |
| Idempotency / duplicate prevention | **Implemented and locally verified** — unique database key plus replay test. |
| Multiple senders and ownership | **Implemented and locally verified** — sender-scoped limits and cross-tenant sender rejection. All senders currently use the configured global SMTP transport; see trade-offs. |
| SMTP delivery and attempts | **Implemented; live verification requires Ethereal credentials** — worker and Nodemailer integration are present. |
| Elasticsearch indexing/search | **Implemented and locally verified** — indexing and tenant-isolation search test. |
| Bull Board | **Implemented and locally verified** — unauthenticated access returns 401; authenticated browser access requires a session. |
| Google OAuth | **Implemented; external credentials/manual browser verification required**. |
| Slack OAuth and rate-limit alerts | **Implemented; external credentials/manual Slack verification required** — alert deduplication and provider-failure isolation are tested locally. |
| React dashboard, uploads, scheduled/sent tables | **Implemented and locally build-verified** — live browser/API verification still requires OAuth. |
| Loading, empty, and error states | **Implemented and locally build-verified** in the dashboard. |
| Automated tests | **Implemented and locally verified** — `npm run test` (8 deterministic tests). Live provider behavior is not claimed. |

## Honest limitations and trade-offs

- SMTP has a crash-after-acceptance window: if the provider accepts a message and the worker crashes before PostgreSQL is marked `SENT`, a retry can produce a duplicate. Database idempotency and transactional claiming reduce duplicates but cannot provide exactly-once SMTP semantics.
- “Multiple senders” means multiple sender identities and independent limits while using one global Ethereal/SMTP account. Sender-specific SMTP credentials are not stored or exposed; adding encrypted per-sender credentials would be a product decision, not required for the local Ethereal interpretation.
- Express’s in-memory session store is suitable for local evaluation only. Production should use a shared persistent session store and HTTPS.
- Google, Slack, and Ethereal live flows require operator credentials and were not claimed as locally verified in this repository.
- `npm audit --omit=dev` reports two moderate transitive advisories (`uuid` through `gaxios` and `google-auth-library`; missing buffer bounds check, affecting versions below `uuid` 11.1.1). The current OAuth dependency chain pins `gaxios@6`/`uuid@9`; no compatible, non-breaking transitive override was applied. The application does not call the vulnerable UUID buffer APIs directly. Re-evaluate when upgrading `google-auth-library`.

## Useful checks

```powershell
npm run test
npm run build
npm audit --omit=dev
docker compose ps
```

See [PRD.md](./PRD.md) and [TRD.md](./TRD.md) for the fuller product and technical decisions.
