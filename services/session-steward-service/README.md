# session-steward-service

**Purpose:** Evaluates whether long-running AIRE-Edge work is advancing a declared session objective.

**Responsibilities:** Session contracts, deterministic progression, evidence freshness, confidence drift, assessments, and intervention state.

**Boundary:** Source services remain authoritative for deployment, telemetry, QoE, and evidence facts. GPT interpretation is deliberately outside the deterministic engine.

**Initial workflow:** Edge rollout plus QoE validation.

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
