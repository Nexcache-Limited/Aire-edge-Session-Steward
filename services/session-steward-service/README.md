# session-steward-service

**Purpose:** Evaluates whether long-running AIRE-Edge work is advancing a declared session objective.

**Responsibilities:** Session contracts, deterministic progression, evidence freshness, confidence drift, assessments, and intervention state.

**Boundary:** Source services remain authoritative for deployment, telemetry, QoE, and evidence facts. GPT interpretation is deliberately outside the deterministic engine.

**Initial workflow:** Edge rollout plus QoE validation.

## Live ingest configuration

Set `NATS_ENABLED=true` to start the live listeners.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/session_steward_service` | PostgreSQL connection |
| `NATS_ENABLED` | `false` | Enables live subscribers |
| `NATS_URL` | `nats://localhost:4222` | NATS server |
| `NATS_DEPLOYMENT_SUBJECT` | `aire.deployment.events` | Deployment events |
| `NATS_TELEMETRY_SUBJECT` | `aire.telemetry.events` | Telemetry events |
| `NATS_QOE_SUBJECT` | `aire.*.qoe.>` | QoE scores and validation lifecycle events |
| `NATS_EVIDENCE_SUBJECT` | `aire.*.evidence.>` | Evidence artifacts, citations, and notes |

Read APIs require an `x-tenant-id` header:

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
It also includes deterministic `progression`, step-level contract status, an operator
rationale summary, and one recommended next action.

The expected evidence-service lifecycle envelope is codified in
`schemas/evidence-lifecycle-event.schema.json`; fixtures keep end-to-end development
unblocked until the upstream publisher is live.

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
