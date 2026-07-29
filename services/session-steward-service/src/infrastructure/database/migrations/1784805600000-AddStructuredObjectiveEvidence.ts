import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStructuredObjectiveEvidence1784805600000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE steward_session_evidence
      ADD COLUMN tenant_id UUID,
      ADD COLUMN evidence_kind TEXT,
      ADD COLUMN source_service TEXT,
      ADD COLUMN source_ref TEXT,
      ADD COLUMN metric_set JSONB,
      ADD COLUMN artifact JSONB,
      ADD COLUMN recorded_at TIMESTAMPTZ
    `);
    await runner.query(`
      UPDATE steward_session_evidence evidence
      SET tenant_id = sessions.tenant_id,
          recorded_at = evidence.created_at
      FROM steward_sessions sessions
      WHERE sessions.id = evidence.session_id
    `);
    await runner.query(`
      ALTER TABLE steward_session_evidence
      ALTER COLUMN tenant_id SET NOT NULL,
      ALTER COLUMN recorded_at SET NOT NULL
    `);
    await runner.query(`
      CREATE INDEX idx_steward_evidence_tenant_kind_time
      ON steward_session_evidence(tenant_id, evidence_kind, recorded_at)
    `);
    await runner.query(`
      CREATE UNIQUE INDEX uq_steward_evidence_source_kind
      ON steward_session_evidence(source_event_id, evidence_kind)
      WHERE source_event_id IS NOT NULL AND evidence_kind IS NOT NULL
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP INDEX IF EXISTS uq_steward_evidence_source_kind`);
    await runner.query(`DROP INDEX IF EXISTS idx_steward_evidence_tenant_kind_time`);
    await runner.query(`
      ALTER TABLE steward_session_evidence
      DROP COLUMN recorded_at,
      DROP COLUMN artifact,
      DROP COLUMN metric_set,
      DROP COLUMN source_ref,
      DROP COLUMN source_service,
      DROP COLUMN evidence_kind,
      DROP COLUMN tenant_id
    `);
  }
}
