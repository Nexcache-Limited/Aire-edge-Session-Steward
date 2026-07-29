# session-steward-service

**Purpose:** Evaluates whether long-running AIRE-Edge work is advancing a declared session objective.

**Responsibilities:** Session contracts, deterministic progression, evidence freshness, confidence drift, assessments, and intervention state.

**Boundary:** Source services remain authoritative for deployment, telemetry, QoE, training, and evidence facts. GPT interpretation is deliberately outside the deterministic engine.

**Initial workflows:** Edge rollout plus QoE validation, and the first AIRE-Edge
model-training lifecycle.

## Live ingest configuration

Set `NATS_ENABLED=true` to start the live listeners.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Local default in development; required in production | PostgreSQL connection |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `true` in production | Verify the PostgreSQL TLS certificate; opt out only when required by the provider |
| `MIGRATIONS_RUN` | `false` | Set to `true` only when startup-based migration is intentional |
| `SESSION_STEWARD_API_TOKEN` | Required | Shared web-to-backend bearer secret of at least 32 characters |
| `NATS_ENABLED` | `false` | Enables live subscribers |
| `NATS_URL` | Local default in development; required when enabled in production | NATS server |
| `NATS_DEPLOYMENT_SUBJECT` | `aire.deployment.events` | Deployment events |
| `NATS_TELEMETRY_SUBJECT` | `aire.telemetry.events` | Telemetry events |
| `NATS_QOE_SUBJECT` | `aire.*.qoe.>` | QoE scores and validation lifecycle events |
| `NATS_EVIDENCE_SUBJECT` | `aire.*.evidence.>` | Evidence artifacts, citations, and notes |
| `NATS_TRAINING_SUBJECT` | `aire.*.training.session.*.events` | AIRE-Edge training lifecycle events |

Except for `/health`, production APIs require
`Authorization: Bearer <SESSION_STEWARD_API_TOKEN>`. Read APIs additionally
require an `x-tenant-id` header:

- `GET /sessions`
- `GET /sessions/:id`
- `GET /sessions/:id/timeline`
- `GET /sessions/:id/assessments?limit=25`
- `GET /sessions/:id/evidence`

Contract-aware operator APIs:

- `GET /contract-templates`
- `POST /contract-templates`
- `GET /contract-templates/:id`
- `POST /sessions/:id/contract`

Assigning with `replaceExisting: true` creates a new immutable contract version for
the run. Template definitions remain reusable and unchanged.

The detail response includes an `evidenceSummary` with baseline, post-change validation,
comparison, and recommendation presence plus the latest QoE, packet-loss, and delta values.
For `model_training` sessions it also includes a `training` summary covering start,
checkpoint progress, validation, convergence, completion/failure, and the latest
artifact reference.
It also includes deterministic `progression`, step-level contract status, an operator
rationale summary, and one recommended next action.

The expected evidence-service lifecycle envelope is codified in
`schemas/evidence-lifecycle-event.schema.json`; fixtures keep end-to-end development
unblocked until the upstream publisher is live.

## AIRE-Edge training-session correlation

The v1 training publisher emits
`aire.<tenant>.training.session.<training_session_id>.events`. Steward uses the
envelope's `training_session_id` as its own session UUID because it is present
even when an early `TrainingFailed` event has no MLflow `run_id`. Seed the
matching active session before the first event:

```bash
psql "$DATABASE_URL" \
  -v training_session_id='<AIRE_TRAINING_SESSION_UUID>' \
  -v tenant_id='<TRAINING_TENANT_UUID>' \
  -f scripts/staging/ensure-training-session.sql
```

The operator can then create and assign the built-in AIRE-Edge training
contract definition from `/operator`. No schema migration is required for
training events because the existing event and evidence stores use typed
identifiers with JSONB metrics, artifacts, and source values.
Set the live-steward web project's `STEWARD_DEMO_SESSION_ID` to the same UUID.
If events arrive before the contract is assigned, Steward retains the matched
events and evidence; contract assignment evaluates that persisted history.

## Staging migrations

Apply migrations as a dedicated job with NATS disabled:

```bash
npm ci
DATABASE_URL="$STAGING_DATABASE_URL" NODE_ENV=production npm run migration:show
DATABASE_URL="$STAGING_DATABASE_URL" NODE_ENV=production npm run migration:run
```

Take a database snapshot first and start the application only after
`migration:show` reports no pending migrations. Prefer snapshot restoration for
rollback because reverting the Sprint 3 and Sprint 4 migrations removes
structured evidence and contract-template data.

Production startup fails when `DATABASE_URL` is absent. When
`NATS_ENABLED=true`, production startup also requires `NATS_URL` and a
successful connection. See the repository
[`live-steward staging runbook`](../../docs/live-steward-staging-runbook.md)
for the exact deployment order, seed procedure, validation checks, and rollback
guidance.

## Structure

- `src/domain` - pure deterministic session engine
- `src/application` - NestJS orchestration boundary
- `src/infrastructure` - TypeORM entities, migrations, and database configuration
- `src/health` - service health endpoint

## Verification

```bash
cd services/session-steward-service
npm ci
npm test
npm run build
```
