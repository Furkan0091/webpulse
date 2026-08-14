# WebPulse

**Know When Your Systems Go Down — Before Your Users Do.**

WebPulse is a production-grade website & API monitoring, incident detection and observability platform. It registers websites/APIs, checks them continuously on a schedule, detects failures, creates and tracks incidents through a full lifecycle, sends deduplicated alerts, and publishes public status pages.

Built to demonstrate real backend engineering and system design: a scheduler, a Redis-backed job queue (BullMQ), background workers, a modular monitoring engine, an incident state machine, multi-tenant data isolation, RBAC, SSRF protection, and time-series aggregation.

---

## Overview

```
User creates monitor
        ↓
Monitoring scheduler (Redis queue)
        ↓
Background worker
        ↓
HTTP / API / SSL / DNS / TCP / Keyword check
        ↓
Store result
        ↓
Analyze result
        ↓
Detect failure (configurable threshold)
        ↓
Create / update incident
        ↓
Trigger notification (deduplicated + escalation)
        ↓
Track recovery → resolve incident
        ↓
Generate analytics (uptime, percentiles, SLA)
```

---

## Core Features

- **Monitoring**: HTTP/HTTPS, API (with JSON assertions), SSL certificate, DNS, TCP, and keyword monitors.
- **Scheduled checks** with a proper scheduler (no per-monitor timers) and **configurable intervals** (30s → 1h) that are actually respected.
- **Background workers** processing checks from a **BullMQ + Redis** queue with retries, backoff, concurrency, and job cleanup.
- **Incident lifecycle**: `INVESTIGATING → IDENTIFIED → MONITORING → RESOLVED`, with failure thresholds, retries, recovery confirmation, a full event timeline, acknowledgements, and internal notes.
- **Alerting**: Email, Slack, Discord, Microsoft Teams, and signed webhooks — with **deduplication**, **escalation**, and an alert-history/delivery log.
- **Analytics**: uptime %, avg/min/max/p50/p95/p99 response times, time-series charts, and a simple statistical **anomaly detector**.
- **Public status pages** with per-monitor status, active incidents, and maintenance windows, served over an unauthenticated read-only API.
- **Multi-tenancy** with organizations, roles (Owner/Admin/Developer/Viewer), and backend-enforced isolation.
- **Security**: bcrypt password hashing, JWT access + refresh tokens, API keys (hashed at rest, shown once), **SSRF protection**, rate limiting, Helmet, CORS, and webhook signing.
- **Maintenance windows**, monitor groups, tags, dependencies, SLA tracking, audit logs, and global search.
- **Real-time updates** over WebSockets (Socket.IO).
- **OpenAPI/Swagger** docs at `/api/docs`.

---

## Architecture

```
                    ┌───────────────┐
                    │   Frontend    │  React + Vite + Tailwind + Recharts
                    └───────┬───────┘
                            │ REST + WebSocket
                            ▼
                    ┌───────────────┐
                    │   API Server  │  Express + TypeScript
                    └───────┬───────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
            ▼               ▼               ▼
       PostgreSQL         Redis         Socket.IO
       (Prisma)       (BullMQ queues)  (realtime events)
                            │
                            ▼
                      ┌───────────┐
                      │  Workers  │
                      └─────┬─────┘
                            │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
          HTTP Check   SSL Check    DNS Check
              │            │            │
              └────────────┼────────────┘
                           ▼
                    Monitoring Results
                           │
                           ▼
                    Incident Engine
                           │
                           ▼
                   Notification Queue
```

### Repo layout

```
server/                     backend (Express + TypeScript)
  src/
    config/                 env, logger, rate limits, swagger
    lib/                    prisma, redis, errors
    utils/                  ssrf, httpClient, stats, assert, jwt, password, crypto
    middleware/             auth, org isolation, RBAC, api-key auth, validation, errors
    validators/             zod schemas
    monitoring/             checkers (http/ssl/dns/tcp) + engine dispatch
    incident/               incident state machine
    notifications/          alert engine + channel senders
    queues/                 BullMQ queues
    workers/                scheduler, monitor worker, notification worker
    routes/                 REST + public + api-v1
    services/               auth, org, monitor, incident, analytics, dashboard, …
  prisma/
    schema.prisma           full data model
    seed.ts                 demo data (Vertex Systems)
web/                        frontend (React + Vite + Tailwind)
docker-compose.yml          Postgres + Redis
```

---

## Monitoring Engine

Each checker produces a standardized result:

```ts
{ status, httpStatus?, responseTimeMs?, error?, errorCode?, dnsMs?, connectMs?, tlsMs?, totalMs?, metadata? }
```

- `HTTP` / `API` / `KEYWORD` / `JSON` — a phase-timed HTTP client (DNS / connect / TLS / TTFB / total) with **SSRF-safe redirect following** (every redirect hop is re-validated).
- `SSL` — `tls.connect` to read the peer certificate (subject, issuer, validity, days remaining, TLS version).
- `DNS` — A/AAAA via the OS resolver, MX/TXT/CNAME via c-ares, with optional expected-record validation.
- `TCP` — raw socket connect with timeout.

**Retries** are bounded and configurable (`retries` per check). A `DEGRADED` status is produced when a check succeeds but exceeds the response-time threshold.

---

## Queue Architecture

| Queue                 | Purpose                                      | Retries / backoff |
| --------------------- | -------------------------------------------- | ----------------- |
| `monitor-checks`      | one job per due monitor                      | 3, exponential    |
| `incident-processing` | incident state transitions (reserved)        | 3, exponential    |
| `notifications`       | deliver alerts to channels/webhooks          | 5, exponential    |
| `report-generation`   | SLA / weekly reports                         | 3                 |

The **scheduler** scans for due monitors and claims them atomically (advancing `nextCheckAt`), so multiple scheduler instances never double-enqueue a check.

---

## Incident Lifecycle

```
Failure detected (check DOWN/DEGRADED)
   ↓ failure counter increments (Redis)
   ↓ reaches monitor.failureThreshold
Incident created (INVESTIGATING)
   ↓ alert sent (once — deduplicated)
Investigation (acknowledge, notes, status changes)
   ↓ recovery detected
MONITORING (recovery confirmation)
   ↓ next check also healthy
RESOLVED (duration recorded)
   ↓ recovery alert sent
```

Escalation re-notifies if an incident stays unresolved past its configured thresholds (e.g. 5/15/30/60 minutes).

---

## Alerting Architecture

```
sendAlert(monitor, type, dedupeKey)
   │  1. Redis SET-NX dedup gate (no repeated spam)
   │  2. resolve channels (monitor policy → org default)
   │  3. create NotificationDelivery rows
   │  4. enqueue to notifications queue
   ▼
notification worker → channel sender (email/slack/discord/teams/webhook)
   │
   ▼
delivery status: PENDING → RETRYING → DELIVERED | FAILED
```

Webhooks are signed with `X-WebPulse-Signature: sha256=<hmac>`.

---

## Security

- **Password hashing** — bcrypt (12 rounds). Never stored in plaintext.
- **JWT** — short-lived access tokens + rotating refresh tokens with server-side session records.
- **Multi-tenant isolation** — every org-scoped record carries an `organizationId`; a single `requireOrg` middleware is the enforcement choke-point. Changing an ID in the URL cannot cross org boundaries (verified by tests).
- **RBAC** — Owner / Admin / Developer / Viewer, enforced server-side.
- **SSRF protection** — private IPv4 ranges, link-local, loopback, cloud metadata endpoints, and internal hostnames are blocked; **redirects are re-checked**.
- **API keys** — generated securely, hashed (SHA-256) at rest, shown once, revocable, with scopes.
- **Rate limiting** — separate limits for auth, authenticated API, and public endpoints.
- **Input validation** — zod on every route.
- **Secrets redaction** — passwords, tokens, and keys are redacted from logs.

---

## Database Design

PostgreSQL via Prisma. Key entities:

```
organizations          users               organization_members
monitors               monitor_groups      tags
check_results          aggregated_metrics  (time-series)
incidents              incident_events     incident_notes
alert_policies         notification_channels notification_deliveries
ssl_certificates       dns_records
status_pages           status_page_monitors maintenance_windows
api_keys               webhooks
sla_policies           sla_reports
audit_logs             activity_logs       deployments     anomalies
```

- Foreign keys, unique constraints, and composite indexes throughout.
- Time-series queries are indexed on `(monitorId, checkedAt)` and `(organizationId, checkedAt)`.
- **Retention strategy**: raw checks can be pruned (configurable `RETENTION_RAW_CHECKS_DAYS`); `aggregated_metrics` is the model for hourly/daily rollups that live longer.

---

## API Documentation

Interactive OpenAPI/Swagger UI is served at **`http://localhost:4000/api/docs`** (JSON at `/api/docs.json`).

| Area | Endpoints |
| ---- | --------- |
| Auth | `POST /api/auth/register` · `/login` · `/refresh` · `/logout` · `/verify-email` · `/forgot-password` · `/reset-password` · `GET /api/auth/me` |
| Organizations | `GET/POST /api/orgs` · `GET/PATCH /api/orgs/:id` · members CRUD |
| Monitors | `GET/POST /api/orgs/:org/monitors` · `GET/PATCH/DELETE /api/orgs/:org/monitors/:id` · `/checks` · `/analytics` · `/pause` · `/resume` |
| Incidents | `GET /api/orgs/:org/incidents` · `GET /api/orgs/:org/incidents/:id` · `/acknowledge` · `/notes` · `/status` |
| Dashboard | `GET /api/orgs/:org/dashboard` |
| Status pages | `GET/POST /api/orgs/:org/status-pages` · `PATCH/DELETE …/:id` · `PUT …/:id/monitors` |
| Public | `GET /api/public/status/:slug` (no auth) |
| Resources | `/channels` · `/alert-policies` · `/maintenance` · `/webhooks` · `/tags` · `/groups` · `/search` · `/audit-logs` |
| API keys | `GET/POST /api/orgs/:org/api-keys` · `DELETE …/:id` |
| Org API | `GET/POST /api/v1/monitors` · `…/status` · `…/uptime` · `…/checks` · `GET /api/v1/incidents` (API-key auth) |

---

## Technology Stack

| Layer | Technology |
| ----- | ---------- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Recharts, React Query, React Router |
| Backend | Node.js, TypeScript, Express |
| Database | PostgreSQL (Prisma ORM + migrations) |
| Queue / Cache | Redis, BullMQ |
| Real-time | Socket.IO |
| Auth | JWT (access + refresh), bcrypt |
| API docs | OpenAPI / Swagger |
| Testing | Vitest, Supertest |
| Infra | Docker Compose (Postgres + Redis) |

---

## Local Setup

### 1. Prerequisites

- Node.js ≥ 20
- Docker + Docker Compose

### 2. Start infrastructure

```bash
docker compose up -d
```

### 3. Install dependencies

```bash
npm install
```

### 4. Configure the backend

```bash
cp server/.env.example server/.env
```

The defaults point at the Dockerized Postgres/Redis. Generate JWT secrets if you like:

```bash
openssl rand -hex 32
```

### 5. Migrate + seed

```bash
npm run db:migrate -w server
npm run db:seed -w server
```

### 6. Run

```bash
npm run dev:server   # http://localhost:4000  (API + workers + scheduler in one process)
npm run dev:web      # http://localhost:5173  (frontend)
```

Or run the worker process separately for a scale-out demonstration:

```bash
npm run worker -w server
```

### Demo login

```
email:    furqan@vertex.systems
password: webpulse-demo-123
```

Demo status page: http://localhost:5173/status/vertex-status

---

## Environment Variables

See [`server/.env.example`](server/.env.example) for the full list. The important ones:

| Variable | Description |
| -------- | ----------- |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | signing secrets |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | token lifetimes |
| `RESEND_API_KEY` / `RESEND_FROM` | transactional email via Resend (takes priority over SMTP) |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | SMTP fallback for email (empty = log-only in dev) |
| `MONITORING_REGION` | region label stamped on check results |
| `MONITOR_WORKER_CONCURRENCY` | concurrent checks per worker |
| `SCHEDULER_INTERVAL_MS` | scheduler scan cadence |
| `RETENTION_RAW_CHECKS_DAYS` | raw check retention |

---

## Database Migration

```bash
npm run db:migrate -w server     # create + apply migrations (dev)
npm run db:deploy -w server      # apply migrations (production)
npm run db:seed -w server        # seed demo data
```

---

## Seed Data

`server/prisma/seed.ts` creates **Vertex Systems** — a demo org with 7 monitors (website, API, payments, auth, staging, SSL, DNS), ~1,800 check results, a resolved "Payment API degraded" incident with a full timeline, an SSL certificate snapshot, a maintenance window, a published status page, an SLA report, and an API key.

The HTTP/SSL/DNS demo monitors point at **real public endpoints**, so live checks produce real response times and certificate data.

---

## Testing

```bash
npm test                       # server tests (Vitest)
```

Coverage:

- **Unit** — statistics (percentiles, anomaly detection), JSON assertion evaluation, SSRF IP blocking.
- **Integration** — registration/login/token-refresh, duplicate email, weak password; **cross-organization isolation** (user B cannot read user A's monitors); **RBAC** (viewer cannot mutate); **SSRF** (private IPs, localhost, and metadata endpoints are rejected at monitor creation).

> Integration tests require Postgres (and Redis for full coverage) to be running. They create isolated test records and clean up after themselves.

---

## Deployment

WebPulse is two deployable pieces — the frontend (static) and the backend (a
persistent Node process that runs the API, scheduler, and workers):

| Piece | Host |
| ----- | ---- |
| Frontend (React/Vite) | Vercel |
| API + scheduler + workers | Render |
| PostgreSQL | Render managed Postgres |
| Redis | Render Key Value (Redis) |

The included `render.yaml` is a Render Blueprint that creates the API service,
Postgres, and Redis in one click. The frontend is deployed to Vercel separately
and points at the Render API URL via the `VITE_API_URL` build variable.

### 1. Push to GitHub

```bash
git init

git add .

git commit -m "WebPulse"

git remote add origin <your-repo-url>

git push -u origin main
```

Secrets (`.env`) are gitignored, so no keys get committed.

### 2. Deploy the backend (Render)

1. In the Render dashboard: **New → Blueprint**, connect your repo, and pick
   `render.yaml`.
2. When prompted, fill in:
   - `CORS_ORIGINS` — your Vercel URL (e.g. `https://webpulse.vercel.app`), plus
     `http://localhost:5173` for local development.
   - `WEB_BASE_URL` — your Vercel URL.
   - `APP_BASE_URL` — your Render API URL (e.g. `https://webpulse-api.onrender.com`).
   - `RESEND_API_KEY` / `RESEND_FROM` — from Resend (see below).
3. Render runs `prisma migrate deploy` on every deploy and seeds the demo
   company ("Vertex Systems") after the first deploy.

The API is live at `https://webpulse-api.onrender.com`, with Swagger docs at
`/api/docs`.

> ⚠️ Free Render web services **sleep after ~15 minutes of inactivity**, which
> pauses the scheduler. For continuous monitoring, upgrade to a paid instance
> or run the workers as a separate background worker.

### 3. Deploy the frontend (Vercel)

1. In Vercel: **Add New → Project**, import the repo.
2. Leave **Root Directory** at the repo root — the included root `vercel.json`
   already builds only the `web` workspace (`npm run build -w web`) and serves
   `web/dist` as a SPA, so no manual build settings are required.
3. Add the environment variable `VITE_API_URL` = your Render API URL
   (e.g. `https://webpulse-api.onrender.com`).
4. Deploy. Visit the Vercel URL, log in with the demo credentials, and the
   frontend talks to the Render backend (CORS is configured via `CORS_ORIGINS`).

### Email (Resend)

Email delivery uses Resend when `RESEND_API_KEY` is set (it takes priority over
SMTP). In Resend:

1. Create an API key and paste it into `RESEND_API_KEY`.
2. Set `RESEND_FROM` to a verified sender, or `WebPulse <onboarding@resend.dev>`
   to send to your own address while testing.

Without Resend or SMTP, emails are logged to the server console instead.

---

## Future Improvements

- Multi-region checks with global vs. local incident detection.
- Email verification / password reset UI flow (tokens + Resend delivery already implemented).
- 2FA and Google OAuth.

- PDF report export.
- Custom domain (CNAME) verification for status pages.

---

## License

MIT — for portfolio/demonstration purposes.
