import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSessionStewardSchema1784632800000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE IF NOT EXISTS steward_sessions (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id           UUID NOT NULL,
        environment_id      UUID,
        objective           TEXT NOT NULL,
        workflow_type       TEXT NOT NULL,
        status              TEXT NOT NULL DEFAULT 'active',
        active_contract_id  UUID,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await runner.query(`
      CREATE TABLE IF NOT EXISTS steward_session_contracts (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id  UUID NOT NULL REFERENCES steward_sessions(id) ON DELETE CASCADE,
        version     INTEGER NOT NULL CHECK (version > 0),
        name        TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_steward_contract_session_version UNIQUE (session_id, version)
      )
    `);

    await runner.query(`
      ALTER TABLE steward_sessions
      ADD CONSTRAINT fk_steward_sessions_active_contract
      FOREIGN KEY (active_contract_id)
      REFERENCES steward_session_contracts(id)
      ON DELETE SET NULL
    `);

    await runner.query(`
      CREATE TABLE IF NOT EXISTS steward_session_contract_steps (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contract_id          UUID NOT NULL REFERENCES steward_session_contracts(id) ON DELETE CASCADE,
        step_order           INTEGER NOT NULL CHECK (step_order >= 0),
        step_key             TEXT NOT NULL,
        title                TEXT NOT NULL,
        expected_event_type  TEXT NOT NULL,
        max_wait_seconds     INTEGER CHECK (max_wait_seconds IS NULL OR max_wait_seconds >= 0),
        required             BOOLEAN NOT NULL DEFAULT TRUE,
        success_rule         JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_steward_step_contract_order UNIQUE (contract_id, step_order),
        CONSTRAINT uq_steward_step_contract_key UNIQUE (contract_id, step_key)
      )
    `);

    await runner.query(`
      CREATE TABLE IF NOT EXISTS steward_session_success_criteria (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contract_id      UUID NOT NULL REFERENCES steward_session_contracts(id) ON DELETE CASCADE,
        criterion_key    TEXT NOT NULL,
        metric_name      TEXT NOT NULL,
        operator         TEXT NOT NULL CHECK (operator IN ('>=', '<=', '>', '<', '=')),
        threshold_value  NUMERIC,
        unit             TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_steward_criterion_contract_key UNIQUE (contract_id, criterion_key)
      )
    `);

    await runner.query(`
      CREATE TABLE IF NOT EXISTS steward_session_events (
        id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id             UUID REFERENCES steward_sessions(id) ON DELETE CASCADE,
        tenant_id              UUID NOT NULL,
        source_service         TEXT NOT NULL,
        source_event_type      TEXT NOT NULL,
        normalized_event_type  TEXT NOT NULL,
        source_ref             TEXT,
        workflow_id            TEXT,
        occurred_at            TIMESTAMPTZ NOT NULL,
        payload                JSONB NOT NULL,
        ingested_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await runner.query(`
      CREATE TABLE IF NOT EXISTS steward_session_evidence (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id            UUID NOT NULL REFERENCES steward_sessions(id) ON DELETE CASCADE,
        evidence_type         TEXT NOT NULL,
        source_event_id       UUID REFERENCES steward_session_events(id) ON DELETE SET NULL,
        freshness_expires_at  TIMESTAMPTZ,
        value                 JSONB NOT NULL,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await runner.query(`
      CREATE TABLE IF NOT EXISTS steward_session_assessments (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id          UUID NOT NULL REFERENCES steward_sessions(id) ON DELETE CASCADE,
        state               TEXT NOT NULL CHECK (
          state IN (
            'progressing',
            'legitimate_wait',
            'attention_needed',
            'intervention_required',
            'recovered',
            'completed',
            'failed'
          )
        ),
        confidence          NUMERIC(5,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
        expected_step_key   TEXT,
        completion_percent  NUMERIC(5,2) NOT NULL CHECK (
          completion_percent >= 0 AND completion_percent <= 100
        ),
        rationale           JSONB NOT NULL,
        assessed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await runner.query(`
      CREATE TABLE IF NOT EXISTS steward_session_interventions (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id           UUID NOT NULL REFERENCES steward_sessions(id) ON DELETE CASCADE,
        status               TEXT NOT NULL DEFAULT 'open' CHECK (
          status IN ('open', 'resolved', 'dismissed')
        ),
        recommendation_text  TEXT NOT NULL,
        trigger_reason       JSONB NOT NULL,
        evidence_ids         UUID[] NOT NULL DEFAULT '{}',
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at          TIMESTAMPTZ
      )
    `);

    await runner.query(
      `CREATE INDEX IF NOT EXISTS idx_steward_sessions_tenant_status ON steward_sessions(tenant_id, status)`,
    );
    await runner.query(
      `CREATE INDEX IF NOT EXISTS idx_steward_contracts_session ON steward_session_contracts(session_id)`,
    );
    await runner.query(
      `CREATE INDEX IF NOT EXISTS idx_steward_steps_contract ON steward_session_contract_steps(contract_id)`,
    );
    await runner.query(
      `CREATE INDEX IF NOT EXISTS idx_steward_criteria_contract ON steward_session_success_criteria(contract_id)`,
    );
    await runner.query(
      `CREATE INDEX IF NOT EXISTS idx_steward_events_session_time ON steward_session_events(session_id, occurred_at)`,
    );
    await runner.query(
      `CREATE INDEX IF NOT EXISTS idx_steward_events_workflow ON steward_session_events(workflow_id)`,
    );
    await runner.query(
      `CREATE INDEX IF NOT EXISTS idx_steward_events_normalized_type ON steward_session_events(normalized_event_type)`,
    );
    await runner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_steward_events_tenant_source
      ON steward_session_events(tenant_id, source_service, source_ref)
      WHERE source_ref IS NOT NULL
    `);
    await runner.query(
      `CREATE INDEX IF NOT EXISTS idx_steward_evidence_session_created ON steward_session_evidence(session_id, created_at)`,
    );
    await runner.query(
      `CREATE INDEX IF NOT EXISTS idx_steward_assessments_session_time ON steward_session_assessments(session_id, assessed_at DESC)`,
    );
    await runner.query(
      `CREATE INDEX IF NOT EXISTS idx_steward_interventions_session_status ON steward_session_interventions(session_id, status)`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE IF EXISTS steward_session_interventions`);
    await runner.query(`DROP TABLE IF EXISTS steward_session_assessments`);
    await runner.query(`DROP TABLE IF EXISTS steward_session_evidence`);
    await runner.query(`DROP TABLE IF EXISTS steward_session_events`);
    await runner.query(`DROP TABLE IF EXISTS steward_session_success_criteria`);
    await runner.query(`DROP TABLE IF EXISTS steward_session_contract_steps`);
    await runner.query(
      `ALTER TABLE steward_sessions DROP CONSTRAINT IF EXISTS fk_steward_sessions_active_contract`,
    );
    await runner.query(`DROP TABLE IF EXISTS steward_session_contracts`);
    await runner.query(`DROP TABLE IF EXISTS steward_sessions`);
  }
}
