# Live Steward staging runbook

This runbook applies only to `live-steward.nexcache.com` and its separate
Session Steward backend. It must not be used against the frozen
`competition-demo` deployment or the `competition-demo` branch.

## Deployment topology and dependencies

```text
Browser
  -> live-steward.nexcache.com (Vercel)
       -> Session Steward API (HTTPS + shared bearer token)
            -> PostgreSQL
            -> NATS (enabled only after database validation)
```

The web application depends on a reachable backend, an existing tenant UUID,
and an existing persisted session UUID. The backend always depends on
PostgreSQL. NATS is optional for the first boot and required for live event
ingestion.

The backend target must support a continuously running Node.js process and
long-lived NATS subscriptions. Do not deploy the NestJS service as a
request-scoped Vercel serverless function. Record the backend provider, service
name, region, HTTPS origin, and deployment identifier before execution.

The backend `/health` endpoint is intentionally unauthenticated so a platform
can perform liveness checks. Every session and contract endpoint requires the
shared bearer token. The browser never receives that token; Vercel server-side
routes add it when proxying authenticated operator requests.

## Configuration contract

### Vercel web project

Set these values only on the Vercel project serving
`live-steward.nexcache.com`. Use the Production environment for the staging
domain and do not copy them to the frozen competition project.

| Variable | Required value |
| --- | --- |
| `SESSION_STEWARD_API_URL` | Public or private HTTPS origin for the backend, with no trailing slash |
| `SESSION_STEWARD_TENANT_ID` | UUID for the staging tenant |
| `SESSION_STEWARD_API_TOKEN` | Random shared secret, at least 32 characters; identical to the backend value |
| `STEWARD_DEMO_SESSION_ID` | UUID of the persisted Essex staging session |
| `OPERATOR_AUTH_MODE` | `credentials` |
| `OPERATOR_AUTH_EMAIL` | The single staging operator email |
| `OPERATOR_AUTH_PASSWORD` | Unique strong password stored only as a Vercel secret |
| `OPERATOR_AUTH_SECRET` | Random cookie-signing secret, at least 32 characters and different from the API token |

Safe placeholders are in
[`examples/live-steward-web.env.example`](examples/live-steward-web.env.example).
Generate independent secrets rather than reusing the examples:

```bash
openssl rand -base64 48
openssl rand -base64 48
openssl rand -base64 24
```

Use the first two outputs for `SESSION_STEWARD_API_TOKEN` and
`OPERATOR_AUTH_SECRET`, and the third as the basis for the operator password.
Do not put the real values in Git, screenshots, PR text, shell history, or
Vercel build logs.

### Session Steward backend

| Variable | Required value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | Platform-provided port, or `3000` |
| `DATABASE_URL` | PostgreSQL connection URI for the staging database |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `true`; use `false` only when the database provider explicitly requires it |
| `MIGRATIONS_RUN` | `false`; migrations are a separate deployment step |
| `SESSION_STEWARD_API_TOKEN` | Same shared secret as the web project |
| `NATS_ENABLED` | `false` for migration and first boot; later `true` |
| `NATS_URL` | NATS connection URI; required when NATS is enabled |
| `NATS_DEPLOYMENT_SUBJECT` | `aire.deployment.events` unless the publisher uses another agreed subject |
| `NATS_TELEMETRY_SUBJECT` | `aire.telemetry.events` unless overridden |
| `NATS_QOE_SUBJECT` | `aire.*.qoe.>` unless overridden |
| `NATS_EVIDENCE_SUBJECT` | `aire.*.evidence.>` unless overridden |
| `OTEL_SERVICE_NAME` | Optional; recommended value `aire-edge-session-steward-service` |

Use
[`examples/live-steward-backend.env.example`](examples/live-steward-backend.env.example)
as a key-only reference. Treat `DATABASE_URL`, `NATS_URL`, and
`SESSION_STEWARD_API_TOKEN` as secrets.

## Exact staging deployment order

### 1. Confirm isolation

- Confirm the checked-out branch is the PR #3 development branch.
- Confirm the working tree is clean and the intended hardening changes are
  committed to that branch before building a staging artifact.
- Record `git rev-parse HEAD`; this is the source SHA every staging deployment
  and evidence item must identify.
- Confirm the backend target is the separate live-steward staging service.
- Confirm the Vercel target owns `live-steward.nexcache.com`.
- Confirm the live-steward deployment is configured to build the recorded PR
  SHA. If the project still deploys `main` and the PR is not merged, stop and
  agree the branch/preview promotion method before proceeding.
- Confirm no command targets `steward.nexcache.com`, `competition-demo`, or the
  frozen competition branch.

Commands:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
```

Stop if the working tree is not clean, the branch is wrong, or the selected
deployment does not resolve to the recorded SHA.

### 2. Build and identify the backend artifact

From the repository root:

```bash
docker build \
  --tag aire-session-steward:pr-3-staging \
  services/session-steward-service
```

Record the image digest or deployment artifact identifier in the PR evidence.
The runtime image exposes port 3000 and includes compiled migration files.

### 3. Snapshot PostgreSQL

Prefer a provider-native snapshot and record its immutable snapshot ID. If the
provider does not support snapshots, create a logical backup from a trusted
administrative machine:

```bash
export STAGING_BACKUP_DIR="/absolute/secure/path/outside/the/repository"
mkdir -p "$STAGING_BACKUP_DIR"
pg_dump "$STAGING_DATABASE_URL" \
  --format=custom \
  --file="$STAGING_BACKUP_DIR/session-steward-before-pr3.dump"
pg_restore \
  --list "$STAGING_BACKUP_DIR/session-steward-before-pr3.dump" \
  >/dev/null
```

The backup directory must remain outside Git. Do not proceed unless the
snapshot or dump can be identified and read.

### 4. Inspect and apply migrations

Run the commands from a clean checkout:

```bash
cd services/session-steward-service
npm ci
DATABASE_URL="$STAGING_DATABASE_URL" \
DATABASE_SSL_REJECT_UNAUTHORIZED=true \
NODE_ENV=production \
npm run migration:show

DATABASE_URL="$STAGING_DATABASE_URL" \
DATABASE_SSL_REJECT_UNAUTHORIZED=true \
NODE_ENV=production \
npm run migration:run

DATABASE_URL="$STAGING_DATABASE_URL" \
DATABASE_SSL_REJECT_UNAUTHORIZED=true \
NODE_ENV=production \
npm run migration:show
```

Alternatively, after building the image, use its already compiled migrations:

```bash
docker run --rm \
  -e DATABASE_URL="$STAGING_DATABASE_URL" \
  -e DATABASE_SSL_REJECT_UNAUTHORIZED=true \
  -e NODE_ENV=production \
  aire-session-steward:pr-3-staging \
  npm run migration:run:compiled
```

The final `migration:show` must show all four migrations as applied:

- `CreateSessionStewardSchema1784632800000`
- `AddLiveIngestCorrelation1784719200000`
- `AddStructuredObjectiveEvidence1784805600000`
- `AddContractTemplatesAndProgression1784892000000`

Do not use `migration:revert` as the primary rollback. The later migrations
remove structured evidence and contract-template fields when reverted. Restore
the recorded database snapshot instead.

### 5. Verify the migrated schema

Run:

```bash
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "SELECT name FROM migrations ORDER BY id;"
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "SELECT to_regclass('public.steward_sessions') AS sessions,
          to_regclass('public.steward_session_contract_templates') AS templates,
          to_regclass('public.steward_session_evidence') AS evidence;"
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "SELECT column_name
     FROM information_schema.columns
    WHERE table_name = 'steward_session_evidence'
      AND column_name IN ('evidence_kind', 'metric_set', 'artifact', 'recorded_at')
    ORDER BY column_name;"
```

All three relations and all four evidence columns must be present.

### 6. First backend boot with NATS disabled

Deploy the backend with:

```text
NODE_ENV=production
MIGRATIONS_RUN=false
NATS_ENABLED=false
```

and the remaining backend variables from the configuration table.

Verify liveness:

```bash
curl --fail --silent --show-error \
  "https://session-steward-api.example.net/health"
```

Verify authenticated database access:

```bash
curl --fail --silent --show-error \
  -H "Authorization: Bearer $SESSION_STEWARD_API_TOKEN" \
  -H "x-tenant-id: $SESSION_STEWARD_TENANT_ID" \
  "https://session-steward-api.example.net/sessions"
```

Also confirm the same sessions request returns HTTP 401 without the
`Authorization` header. A successful `/health` response proves process
liveness; the authenticated sessions request proves database connectivity.

### 7. Create or identify the Essex session

There is currently no public `POST /sessions` endpoint. For staging only, use
the checked-in, idempotent seed SQL after choosing UUIDs and a workflow ID:

```bash
export ESSEX_SESSION_ID="30000000-0000-4000-8000-000000000001"
export ESSEX_TENANT_ID="10000000-0000-4000-8000-000000000001"
export ESSEX_ENVIRONMENT_ID="20000000-0000-4000-8000-000000000001"
export ESSEX_WORKFLOW_ID="essex-edge-rollout-pr3"

psql "$STAGING_DATABASE_URL" \
  -v session_id="$ESSEX_SESSION_ID" \
  -v tenant_id="$ESSEX_TENANT_ID" \
  -v environment_id="$ESSEX_ENVIRONMENT_ID" \
  -v workflow_id="$ESSEX_WORKFLOW_ID" \
  -f scripts/staging/ensure-essex-session.sql
```

If those example UUIDs are already used for unrelated staging records,
generate new UUIDs. Set the web project’s `SESSION_STEWARD_TENANT_ID` and
`STEWARD_DEMO_SESSION_ID` to the exact selected values.

All test publishers must include either this `sessionId`, or the exact same
`tenantId`, `environmentId`, and `workflowId`, so correlation selects the
intended session.

### 8. Configure and deploy the live-steward web project

Set all web variables from the configuration table in the Vercel project that
serves `live-steward.nexcache.com`. Confirm the project and domain before
triggering the deployment. Confirm the resulting Vercel deployment reports the
same source SHA recorded in step 1. Do not set or modify variables on the
competition project.

After deployment:

1. Open `https://live-steward.nexcache.com/operator`.
2. Confirm it redirects to `/operator/login`, not `/signin-with-chatgpt`.
3. Confirm invalid credentials are rejected.
4. Sign in with the configured operator credentials.
5. Confirm the header reports `Persisted staging data`.
6. Sign out and confirm `/operator` is protected again.

### 9. Validate persisted contract operation before NATS

In `/operator`:

1. Create the reusable “Essex QoE promotion” template.
2. Reload and confirm the template remains available.
3. Apply it to the Essex session.
4. Reload and confirm contract version 1, its steps, evidence totals, state,
   rationale, and recommended action remain unchanged.
5. Enable “Create a new contract version for this run,” change its name and
   description, and assign it.
6. Reload and confirm version 2 is active while the reusable template remains
   unchanged.
7. Query `GET /sessions/:id` directly through the authenticated backend and
   retain the redacted JSON response as PR evidence.

### 10. Enable NATS and verify subscribers

Set `NATS_ENABLED=true`, provide the NATS URI and confirmed subjects, then
restart the backend. Production startup now fails if NATS cannot connect.

Confirm the backend logs contain:

```text
Connected to NATS
Subscribed to aire.deployment.events
Subscribed to aire.telemetry.events
Subscribed to aire.*.qoe.>
Subscribed to aire.*.evidence.>
```

The subscribers use live core NATS subscriptions, not durable JetStream
consumers. Keep the backend online before publishing validation events; events
sent while it is offline are not replayed by this service.

### 11. Run the Essex persisted flow

Use unique event IDs and the correlation identifiers from step 7. Publish or
generate events in this order:

1. `QoEScoreEvent` with `payload.phase=baseline`.
2. `deployment.completed`.
3. `health.passed` (normalized to `health.check.passed`).
4. Publish `deployment.polled` at controlled event times approximately T+4 and
   T+8 minutes; the second repeated non-progress poll should produce
   `attention_needed`.
5. Publish a third `deployment.polled` at approximately T+15 minutes; with the
   default Essex validation wait this should produce
   `intervention_required`.
6. `QoEScoreEvent` with `payload.phase=post_change` at T+16; this should produce
   `recovered`.
7. `qoe.comparison.generated` with a positive `comparisonDeltaPct`.
8. `qoe.recommendation.generated` with a promotion recommendation; this should
   produce `completed`, rendered as “Promotion justified.”

The T+ offsets refer to the events’ ISO-8601 occurrence timestamps. They allow
the staging sequence to be published quickly without waiting 15 wall-clock
minutes. Use monotonically increasing timestamps and unique event IDs. Do not
reuse this timestamp technique outside the controlled staging tenant.

After every event, refresh `/operator` and verify that the rendered state,
contract step status, evidence total, delivery confidence, rationale, and one
recommended action match `GET /sessions/:id`.

The acceptance test in
`services/session-steward-service/src/application/objective-evidence.spec.ts`
documents the currently supported camel-case `QoEScoreEvent` envelope.

### 12. Capture PR evidence

Capture:

- Backend deployment identifier and image digest.
- Database snapshot ID and redacted `migration:show` output.
- Successful `/health` and authenticated `/sessions` checks.
- A 401 response from an unauthenticated backend session request.
- Operator login screen.
- Persisted template after reload.
- Contract version 1 and replacement version 2 after reload.
- Progressing/baseline state.
- Attention needed state.
- Intervention required state.
- Recovered state.
- Promotion justified state.
- Final persisted `GET /sessions/:id` response, with secrets and personal data
  removed.
- Backend logs showing the four NATS subscriptions and accepted QoE events.

Never capture passwords, tokens, database/NATS URLs, cookies, Vercel environment
values, or unredacted authorization headers.

## Before marking PR #3 ready

- [ ] Competition branch and deployment confirmed unchanged.
- [ ] Clean source SHA recorded and matched by backend and Vercel deployments.
- [ ] Backend artifact built from the PR commit and recorded.
- [ ] Restorable pre-migration database snapshot recorded.
- [ ] All four migrations applied and verified.
- [ ] Backend first boot passed with NATS disabled.
- [ ] Backend APIs reject missing bearer authentication.
- [ ] Essex tenant/session correlation record verified.
- [ ] Vercel credential login and logout verified.
- [ ] Template creation and selection survived reload.
- [ ] Contract assignment and immutable replacement survived reload.
- [ ] Contract progress, evidence totals, confidence, rationale, and next action
      matched persisted API data.
- [ ] NATS connection and all four subscriptions verified.
- [ ] Current `QoEScoreEvent` baseline and post-change events persisted.
- [ ] Essex progression reached intervention, recovery, and promotion justified.
- [ ] Screenshots and redacted API/log evidence attached.
- [ ] All CI checks still pass.

## PR comment template

```markdown
### Staging validation complete

Validated PR #3 against `live-steward.nexcache.com` using backend deployment
`<deployment-id>` and database snapshot `<snapshot-id>`.

- Migrations: all four applied; no pending migrations
- Auth: Vercel credential login/logout passed; backend bearer protection passed
- Persistence: template selection, contract v1, replacement v2, progress,
  evidence totals, rationale, confidence, and next action survived reload
- Ingest: deployment, telemetry, and current `QoEScoreEvent` baseline/post-change
  events correlated to the Essex session
- Progression: Progressing → Attention needed → Intervention required →
  Recovered → Promotion justified
- Isolation: frozen competition branch and `competition-demo` deployment were
  unchanged

Attached: migration evidence, redacted API responses, subscription logs, and
operator screenshots.

Current `QoEScoreEvent` consumption and deterministic session assessment are
staging-validated. Artifact/citation/note lifecycle consumption is implemented,
but live end-to-end evidence lifecycle validation still depends on the upstream
evidence-service publisher.
```

## Capability boundary

Production-capable with the current path:

- Authenticated web-to-backend operator requests.
- Persisted templates and immutable session contract versions.
- Deployment and telemetry normalization.
- Current `QoEScoreEvent` baseline and post-change normalization.
- Objective evidence persistence, deterministic progression, rationale,
  confidence, and recommended actions.

Still dependent on external integration:

- Live artifact, citation, and note evidence requires the upstream
  evidence-service publisher.
- Durable NATS replay requires a future JetStream consumer; the current
  subscribers are live-only.
- Initial session creation remains an orchestration responsibility. Staging uses
  the controlled SQL seed because this service does not expose `POST /sessions`.

For a tickable execution surface and evidence filenames, use the
[`live-steward staging worksheet`](live-steward-staging-worksheet.md) alongside
this runbook.
