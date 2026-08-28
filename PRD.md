# ReachInbox Email Job Scheduler — Product Requirements

## Purpose

Provide a reliable dashboard for authenticated users to schedule outbound email campaigns, observe delivery status, and search sent email. The system is designed for local development with Ethereal SMTP and production-style persistence, throttling, and recovery behavior.

## Goals

- Schedule individual emails for one or more recipients at a chosen start time.
- Support multiple sender identities and enforce sender-specific sending limits.
- Preserve scheduled work across API and worker restarts.
- Make email state visible through a web dashboard and searchable through Elasticsearch.
- Notify a connected Slack workspace when a sender reaches its hourly limit.

## Personas and user stories

### Campaign operator

- As an authenticated user, I can connect my Google account and see my profile in the dashboard.
- I can add sender identities, upload or paste recipients, configure a campaign, and schedule it.
- I can view scheduled, sent, and failed emails without seeing another user's data.
- I can search my emails and connect or disconnect Slack.

### System operator

- I can inspect waiting, delayed, active, completed, and failed jobs in a protected BullMQ dashboard.

## Functional requirements

| Area | Requirement |
| --- | --- |
| Authentication | Real Google OAuth login, secure session, logout, protected APIs. |
| Scheduling | Persist one email job per recipient; create BullMQ delayed jobs; never use cron. |
| Sending | Use Nodemailer with real Ethereal SMTP credentials; retain message metadata and preview URL. |
| Reliability | Persistent PostgreSQL and Redis, retries for transient failures, practical duplicate prevention. |
| Sender controls | Multiple senders; configurable worker concurrency, minimum sender delay, and hourly sender limit. |
| Rate limiting | Distributed Redis coordination; reschedule excess jobs without failing or dropping them. |
| Search | Index sent emails in Elasticsearch and tenant-filter all queries. |
| Slack | Real Slack OAuth connection and a real rate-limit notification API call. |
| Dashboard | React/TypeScript/Tailwind UI for compose, scheduled/sent tables, search, profile, and Slack state. |
| Observability | Structured logging and protected Bull Board queue inspection. |

## Out of scope

- Production email-provider reputation, unsubscribe handling, bounce processing, and open/click tracking.
- A separate demo-video artifact.
- Horizontal deployment infrastructure such as Kubernetes or Kafka.

## Success criteria

The evaluator can configure credentials, start the local services, log in with Google, schedule email, observe a BullMQ delayed job, receive an Ethereal preview, verify persistence through restart, observe rate-limit rescheduling, search emails, and receive a Slack notification when configured.
