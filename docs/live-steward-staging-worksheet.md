# Live Steward staging execution worksheet

Use this worksheet while executing
[`live-steward-staging-runbook.md`](live-steward-staging-runbook.md). The
runbook remains authoritative. This document provides checkboxes, substitution
fields, stop conditions, and evidence filenames.

This worksheet applies only to `live-steward.nexcache.com`. Never enter
competition project credentials or target `steward.nexcache.com`,
`competition-demo`, or the frozen competition branch.

## Session record

Fill this in before running any command. Do not write secret values here.

| Field | Recorded value |
| --- | --- |
| Date/time and timezone | |
| Primary operator | |
| Second-person checker | |
| Repository path | |
| PR branch | |
| Source commit SHA | |
| Backend provider/service | |
| Backend region | |
| Backend HTTPS origin | |
| Backend deployment command approved | |
| PostgreSQL provider/database | |
| Snapshot method and destination | |
| NATS provider/cluster | |
| Vercel team/project | |
| Vercel production branch/deployment method | |
| Concrete deployment event subject | |
| Concrete telemetry event subject | |
| Concrete QoE publish subject | |
| Concrete evidence publish subject | |
| Event publishing tool/owner | |
| Evidence folder outside Git | |

## Gate A — go/no-go before staging

Mark **GO** only when every required box is checked.

### Isolation and source

- [ ] I am working in the AIRE-Edge Session Steward repository.
- [ ] The intended source branch is the PR #3 branch.
- [ ] All local hardening changes have been reviewed, committed, and pushed
      with explicit authorization.
- [ ] The working tree is clean.
- [ ] The source SHA has been recorded above.
- [ ] The backend artifact will be built from that exact SHA.
- [ ] The live-steward Vercel deployment method will deploy that exact SHA,
      even if the project’s normal production branch is still `main`.
- [ ] No step targets the competition branch, project, domain, or deployment.

Commands from the repository root:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
```

Success:

- `git status --short` prints nothing.
- The branch is the agreed PR #3 branch.
- The SHA matches the value recorded in the worksheet and deployment plan.

**Stop:** any uncommitted change, wrong branch, or unresolved difference between
the PR SHA and deployment SHA.

Evidence:

- [ ] `00-source-sha.txt` — branch and SHA only; do not include remote tokens.

### Backend hosting

- [ ] A separate backend service exists.
- [ ] It supports a continuously running Node.js process.
- [ ] It supports long-lived outbound NATS connections.
- [ ] It provides an HTTPS origin.
- [ ] Its deployment logs and source/artifact identifier are accessible.
- [ ] Its environment variables can be changed between first boot and NATS
      enablement.
- [ ] It is not implemented as a request-scoped Vercel serverless function.
- [ ] The provider-specific build/deploy/restart commands are written down and
      approved.

**Stop:** the hosting target cannot maintain a continuous NATS subscription or
cannot prove which source SHA it deployed.

### PostgreSQL

- [ ] `STAGING_DATABASE_URL` is available through a secret manager.
- [ ] The operator has migration and schema inspection permissions.
- [ ] A provider snapshot can be created, or `pg_dump`/`pg_restore` are
      installed on a trusted administrative machine.
- [ ] The snapshot retention and restore procedure are known.
- [ ] The provider’s TLS requirements are known.
- [ ] `DATABASE_SSL_REJECT_UNAUTHORIZED=false` has not been selected unless the
      provider explicitly requires it.

**Stop:** no restorable snapshot method, insufficient migration permissions, or
unknown TLS requirements.

### NATS and event publishing

- [ ] NATS credentials are available through a secret manager.
- [ ] The backend network can reach the NATS cluster.
- [ ] Deployment, telemetry, QoE, and evidence subscription subjects are
      confirmed.
- [ ] The concrete QoE subject used for publishing is confirmed; it matches
      `NATS_QOE_SUBJECT`.
- [ ] An operator or upstream service can publish the controlled Essex sequence.
- [ ] The backend will be online before any event is published.
- [ ] Everyone understands that the current subscribers are live-only and do
      not replay missed messages.

**Stop:** any subject mismatch, no controlled publisher, or no way to inspect
subscriber logs.

### Vercel and operator access

- [ ] The operator has environment and deployment access to the project serving
      `live-steward.nexcache.com`.
- [ ] The Vercel project/team identity has been independently checked.
- [ ] The project is not the frozen competition project.
- [ ] The staging operator email has been agreed.
- [ ] A unique operator password will be stored only in the secret manager and
      Vercel.
- [ ] The person validating login does not need access to raw application
      secrets.

**Stop:** project identity is ambiguous or the only available target is the
competition project.

### Identifiers and secrets

- [ ] Essex tenant UUID selected.
- [ ] Essex session UUID selected.
- [ ] Essex environment UUID selected.
- [ ] Essex workflow ID selected.
- [ ] API bearer token generated with at least 32 characters.
- [ ] Cookie-signing secret generated with at least 32 characters.
- [ ] API bearer token and cookie secret are different.
- [ ] Secrets are stored in a password/secret manager and not this worksheet.

Generate values without committing them:

```bash
openssl rand -base64 48
openssl rand -base64 48
openssl rand -base64 24
uuidgen
uuidgen
uuidgen
```

Use the first two random values as the API token and cookie-signing secret. The
third can form the operator password. Use the three UUIDs for tenant, session,
and environment when existing approved staging identifiers are unavailable.

**Stop:** a secret was copied into Git, PR text, evidence files, or a shared
worksheet.

### Gate A decision

- [ ] **GO** — every mandatory prerequisite above is satisfied.
- [ ] **NO-GO** — stop before snapshot, migration, or deployment.

Decision, owner, and timestamp:

```text
Decision:
Owner:
Timestamp:
Outstanding item, if NO-GO:
```

## Gate B — environment value map

Record only non-secret identifiers. Record secret-manager references instead
of secret values.

### Web

| Variable | Value or secret reference | Checked |
| --- | --- | --- |
| `SESSION_STEWARD_API_URL` | | [ ] |
| `SESSION_STEWARD_TENANT_ID` | | [ ] |
| `SESSION_STEWARD_API_TOKEN` | secret reference: | [ ] |
| `STEWARD_DEMO_SESSION_ID` | | [ ] |
| `OPERATOR_AUTH_MODE` | `credentials` | [ ] |
| `OPERATOR_AUTH_EMAIL` | | [ ] |
| `OPERATOR_AUTH_PASSWORD` | secret reference: | [ ] |
| `OPERATOR_AUTH_SECRET` | secret reference: | [ ] |

### Backend

| Variable | Value or secret reference | Checked |
| --- | --- | --- |
| `NODE_ENV` | `production` | [ ] |
| `PORT` | provider value or `3000` | [ ] |
| `DATABASE_URL` | secret reference: | [ ] |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `true` unless provider requires otherwise | [ ] |
| `MIGRATIONS_RUN` | `false` | [ ] |
| `SESSION_STEWARD_API_TOKEN` | same secret reference as web: | [ ] |
| `NATS_ENABLED` | initially `false` | [ ] |
| `NATS_URL` | secret reference: | [ ] |
| `NATS_DEPLOYMENT_SUBJECT` | | [ ] |
| `NATS_TELEMETRY_SUBJECT` | | [ ] |
| `NATS_QOE_SUBJECT` | | [ ] |
| `NATS_EVIDENCE_SUBJECT` | | [ ] |
| `OTEL_SERVICE_NAME` | `aire-edge-session-steward-service` or blank | [ ] |

- [ ] The API token reference is identical on web and backend.
- [ ] The cookie-signing secret is not reused as the API token.
- [ ] The API URL has no trailing slash and uses HTTPS.
- [ ] The web tenant/session IDs equal the identifiers used by the seed.

## Execution

### Step 1 — build the backend artifact

Location: repository root.

```bash
docker build \
  --tag aire-session-steward:pr-3-staging \
  services/session-steward-service

docker image inspect \
  --format '{{.Id}}' \
  aire-session-steward:pr-3-staging
```

Substitute: no values; run from the recorded clean source SHA.

Success:

- Docker build exits 0.
- The image ID is recorded.
- The build log identifies the expected source context.

Evidence:

- [ ] `01-backend-build.txt` — redacted successful build summary.
- [ ] `02-backend-artifact.txt` — source SHA, image ID/deployment identifier.

**Stop:** build failure or artifact cannot be tied to the recorded source SHA.

### Step 2 — snapshot PostgreSQL

Preferred: create a provider-native snapshot and record its immutable ID.

Fallback from a trusted machine:

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

Substitute:

- `STAGING_BACKUP_DIR` with a secured path outside the repository.
- `STAGING_DATABASE_URL` through the local secret environment.

Success:

- Snapshot ID exists, or both commands exit 0.
- The dump can be listed.
- Restore ownership and procedure are known.

Evidence:

- [ ] `03-database-snapshot.txt` — snapshot ID, timestamp, database name, and
      verification result; no connection URI.

**Stop:** snapshot/dump failure or no confirmed restore path.

### Step 3 — inspect and apply migrations

Location: `services/session-steward-service`.

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

Substitute `DATABASE_SSL_REJECT_UNAUTHORIZED=false` only if the database
provider has explicitly documented that requirement.

Success: all four migrations show as applied and none remain pending.

Evidence:

- [ ] `04-migration-before.txt` — redacted pre-run output.
- [ ] `05-migration-run.txt` — redacted successful run.
- [ ] `06-migration-after.txt` — all four migrations applied.

**Stop:** any migration error, unexpected migration, TLS downgrade without
provider justification, or pending migration after the run. Do not use
`migration:revert`; follow the snapshot restore procedure.

### Step 4 — verify the schema

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

Success:

- All four migration names are present.
- All three relations resolve.
- All four structured evidence columns are present.

Evidence:

- [ ] `07-schema-verification.txt` — query outputs with infrastructure details
      redacted.

**Stop:** any relation or column is absent.

### Step 5 — first backend deployment with NATS disabled

Provider-specific deployment command:

```text
<approved backend deploy command for the recorded artifact>
```

Required first-boot settings:

```text
NODE_ENV=production
MIGRATIONS_RUN=false
NATS_ENABLED=false
```

Success:

- Deployment reports Ready/Healthy.
- Deployment source/artifact matches the recorded SHA/image.
- Logs state that NATS ingestion is disabled.
- No migration runs at application startup.

Evidence:

- [ ] `08-backend-deployment.png` — provider deployment status and identifier.
- [ ] `09-backend-first-boot.log` — redacted startup log showing NATS disabled.

**Stop:** wrong source SHA, startup migration, crash loop, database error, or
unexpected NATS connection attempt.

### Step 6 — health and API protection

```bash
export STAGING_BACKEND_URL="https://session-steward-api.example.net"

curl --fail --silent --show-error \
  "$STAGING_BACKEND_URL/health"

curl --silent --show-error \
  --output /tmp/steward-unauthenticated.json \
  --write-out '%{http_code}\n' \
  -H "x-tenant-id: $SESSION_STEWARD_TENANT_ID" \
  "$STAGING_BACKEND_URL/sessions"

curl --fail --silent --show-error \
  -H "Authorization: Bearer $SESSION_STEWARD_API_TOKEN" \
  -H "x-tenant-id: $SESSION_STEWARD_TENANT_ID" \
  "$STAGING_BACKEND_URL/sessions" \
  > /tmp/steward-sessions.json
```

Substitute `STAGING_BACKEND_URL`; export tenant ID and API token from secure
local inputs.

Success:

- `/health` returns HTTP 200.
- The unauthenticated request prints `401`.
- The authenticated request exits 0 and returns a JSON session list.

Evidence:

- [ ] `10-health.json` — health body and HTTP status.
- [ ] `11-api-unauthenticated.txt` — 401 status and generic redacted response.
- [ ] `12-api-authenticated.json` — redacted session list; do not capture the
      Authorization header.

**Stop:** health failure, unauthenticated acceptance, authenticated rejection,
or non-JSON database response.

### Step 7 — create or identify the Essex session

Location: `services/session-steward-service`.

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

Substitute all four values with the approved staging identifiers. Use the
example UUIDs only if they are known to be free or already identify this exact
staging session.

Success: the script exits 0 and prints one active session with the expected
tenant, environment, workflow, and session identifiers.

Evidence:

- [ ] `13-essex-session-seed.txt` — selected identifiers and resulting row;
      redact only if staging identifiers are considered sensitive.

**Stop:** ID collision, zero result rows, mismatched correlation fields, or
unexpected active contract.

### Step 8 — configure and deploy the live-steward web application

- [ ] Confirm Vercel team and project match the recorded live-steward values.
- [ ] Confirm the project serves `live-steward.nexcache.com`.
- [ ] Confirm it is not the competition project.
- [ ] Enter every Gate B web variable in the intended Vercel environment.
- [ ] Trigger the approved deployment of the recorded PR source SHA.
- [ ] Confirm Vercel reports that exact SHA.

Success: the live-steward domain resolves to a Ready deployment built from the
recorded SHA.

Evidence:

- [ ] `14-vercel-deployment.png` — project, domain, Ready status, source SHA;
      crop out environment values.

**Stop:** wrong project/domain/SHA, missing variable, or any operation that
would change the competition project.

### Step 9 — validate operator authentication

1. Open `https://live-steward.nexcache.com/operator`.
2. Confirm redirect to `/operator/login`.
3. Submit invalid credentials and confirm rejection.
4. Sign in with the staging operator credentials.
5. Confirm `Persisted staging data`.
6. Sign out.
7. Reopen `/operator` and confirm it is protected.

Evidence:

- [ ] `15-operator-login.png` — login screen, no entered password.
- [ ] `16-invalid-login.png` — generic rejection, no entered password.
- [ ] `17-operator-connected.png` — signed-in persisted staging status.
- [ ] `18-operator-logout.png` — protected route after logout.

**Stop:** ChatGPT sign-in redirect, credential bypass, authentication cookie
failure, or staging API unavailable.

### Step 10 — validate persisted contract operation

- [ ] Create the reusable “Essex QoE promotion” template.
- [ ] Reload; confirm it remains available and selected.
- [ ] Apply it to the session.
- [ ] Reload; confirm version 1 and its state remain.
- [ ] Record the version 1 `GET /sessions/:id` response.
- [ ] Create a run-specific replacement with changed name and description.
- [ ] Reload; confirm version 2 is active.
- [ ] Confirm the reusable template was not changed.
- [ ] Record the version 2 `GET /sessions/:id` response.

Authenticated API capture:

```bash
curl --fail --silent --show-error \
  -H "Authorization: Bearer $SESSION_STEWARD_API_TOKEN" \
  -H "x-tenant-id: $ESSEX_TENANT_ID" \
  "$STAGING_BACKEND_URL/sessions/$ESSEX_SESSION_ID" \
  > /tmp/essex-session-detail.json
```

Evidence:

- [ ] `19-template-after-reload.png`
- [ ] `20-contract-v1-after-reload.png`
- [ ] `21-session-v1.json` — redacted.
- [ ] `22-contract-v2-after-reload.png`
- [ ] `23-session-v2.json` — redacted.

Proof points in JSON:

- Contract version increments from 1 to 2.
- Active contract references version 2.
- Step order and expected event/evidence names are persisted.
- Template identity remains stable.
- Progress, evidence totals, rationale, delivery confidence, and recommended
  action survive reload.

**Stop:** any value exists only in browser state, replacement mutates version 1,
or UI and API disagree.

### Step 11 — enable NATS

- [ ] Set `NATS_ENABLED=true`.
- [ ] Confirm NATS URL and all four subscription subjects.
- [ ] Restart/redeploy only the backend.
- [ ] Confirm it remains tied to the recorded artifact/SHA.

Success logs:

```text
Connected to NATS
Subscribed to aire.deployment.events
Subscribed to aire.telemetry.events
Subscribed to aire.*.qoe.>
Subscribed to aire.*.evidence.>
```

Use the configured values if subjects differ from these defaults.

Evidence:

- [ ] `24-nats-subscriptions.log` — connection and four subscription lines;
      redact NATS URL and credentials.

**Stop:** connection failure, missing subscription, subject mismatch, or backend
artifact change.

### Step 12 — run and record the Essex progression

Use a controlled base timestamp `T`, unique event IDs, and the exact tenant,
session/environment, and workflow identifiers selected above.

| Sequence | Event | Controlled time | Expected state | Captured |
| --- | --- | --- | --- | --- |
| 1 | `QoEScoreEvent`, `phase=baseline` | T | Progressing | [ ] |
| 2 | `deployment.completed` | T+1m | Progressing | [ ] |
| 3 | `health.passed` | T+2m | Progressing | [ ] |
| 4 | `deployment.polled` | T+4m | Progressing/warning signal | [ ] |
| 5 | `deployment.polled` | T+8m | Attention needed | [ ] |
| 6 | `deployment.polled` | T+15m | Intervention required | [ ] |
| 7 | `QoEScoreEvent`, `phase=post_change` | T+16m | Recovered | [ ] |
| 8 | `qoe.comparison.generated` | T+17m | Recovered | [ ] |
| 9 | `qoe.recommendation.generated` | T+18m | Promotion justified | [ ] |

For the QoE proof, use values that satisfy the current Essex template:

```text
baseline qoeScore: 71.4
post-change qoeScore: 79.2
post-change packetLossPct: 0.9
comparisonDeltaPct: positive and at least the configured improvement threshold
recommendation: promote
```

After each event:

1. Confirm the publisher reported success.
2. Confirm backend logs accepted the unique event ID.
3. Refresh `/operator`.
4. Query `GET /sessions/:id`.
5. Compare UI state, contract steps, evidence totals, confidence, rationale, and
   recommended action to the persisted response.
6. Capture only the proof-point states listed below.

Evidence:

- [ ] `25-progressing.png`
- [ ] `26-attention-needed.png`
- [ ] `27-intervention-required.png`
- [ ] `28-recovered.png`
- [ ] `29-promotion-justified.png`
- [ ] `30-qoe-ingest.log` — accepted baseline and post-change event IDs.
- [ ] `31-qoe-evidence.json` — redacted `GET /sessions/:id/evidence`.
- [ ] `32-final-session.json` — redacted final `GET /sessions/:id`.

The final evidence must prove:

- `baselinePresent=true`
- `postChangeValidationPresent=true`
- `comparisonPresent=true`
- `recommendationPresent=true`
- QoE improved
- Packet loss remained within the configured guardrail
- Contract steps are satisfied
- Final state is `completed`, rendered as “Promotion justified”
- Recommended action approves promotion while retaining guardrails

**Stop:** rejected event, duplicate ID, unmatched correlation, UI/API mismatch,
missing evidence, failed guardrail, or an unexpected state transition.

## Evidence redaction and packaging

Create an evidence folder outside Git. Before attaching anything, remove:

- Authorization headers and bearer tokens
- Operator passwords and cookie-signing secrets
- Cookies and session tokens
- PostgreSQL and NATS connection URIs
- Vercel environment values
- Personal data not needed for validation
- Provider account IDs that are not needed to prove deployment identity

Keep visible:

- Source commit SHA
- Deployment identifiers
- Migration names/status
- HTTP status codes
- Tenant/session IDs when staging policy permits
- Contract version numbers
- Normalized event types and unique non-secret event IDs
- Progression state, evidence totals, rationale, confidence, and recommended
  action

Final package:

- [ ] Files `00` through `32` are present where applicable.
- [ ] Every image is readable and timestamped or tied to a deployment/session.
- [ ] Every log/JSON file is redacted and still proves its stated point.
- [ ] No secret scanner warning remains.
- [ ] Competition isolation proof is included.

## Gate C — ready to convert PR #3 from draft

- [ ] Gate A was GO.
- [ ] Backend and Vercel deployments match the recorded source SHA.
- [ ] Competition branch and deployment remained unchanged.
- [ ] Snapshot/rollback evidence exists.
- [ ] All migrations and schema checks passed.
- [ ] Backend liveness and bearer protection passed.
- [ ] Operator login/logout passed.
- [ ] Template persistence and selection passed.
- [ ] Contract v1 and immutable replacement v2 passed.
- [ ] NATS and all four subscriptions passed.
- [ ] Baseline and post-change `QoEScoreEvent` persistence passed.
- [ ] Progressing, Attention needed, Intervention required, Recovered, and
      Promotion justified were captured.
- [ ] Final API data matched the operator UI.
- [ ] Evidence package is redacted and attached.
- [ ] CI still passes on the staged source SHA.
- [ ] The upstream evidence-service dependency is stated explicitly.

If any box is unchecked, keep PR #3 in draft.

## PR comment after Gate C passes

```markdown
### Staging validation complete

Validated PR #3 against `live-steward.nexcache.com`.

- Source: `<commit-sha>`
- Backend deployment: `<deployment-id>`
- Database rollback point: `<snapshot-id>`
- Migrations: all four applied; no pending migrations
- Security: credential login/logout and backend bearer rejection/acceptance passed
- Persistence: template selection, contract v1, immutable replacement v2,
  progress, evidence totals, rationale, confidence, and next action survived reload
- Ingest: deployment, telemetry, and current `QoEScoreEvent` baseline/post-change
  events correlated and persisted
- Progression: Progressing → Attention needed → Intervention required →
  Recovered → Promotion justified
- Isolation: the frozen competition branch and `competition-demo` deployment
  were unchanged

Attached: deployment proof, migration/schema output, redacted API responses,
NATS/QoE logs, and operator screenshots.

The current `QoEScoreEvent` path, deterministic assessment, persisted contracts,
and operator workflow are operational in staging. Artifact/citation/note
lifecycle consumption is implemented, but live end-to-end validation remains
dependent on the upstream evidence-service publisher. The current NATS
subscribers are live-only; durable replay remains future JetStream work.
```
