import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLiveIngestCorrelation1784719200000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE steward_sessions
      ADD COLUMN workflow_id TEXT
    `);
    await runner.query(`
      CREATE INDEX idx_steward_sessions_correlation
      ON steward_sessions(tenant_id, workflow_id, environment_id, status)
    `);

    await runner.query(`
      ALTER TABLE steward_session_events
      ADD COLUMN external_event_id TEXT,
      ADD COLUMN environment_id UUID
    `);
    await runner.query(`
      UPDATE steward_session_events
      SET external_event_id = id::text
      WHERE external_event_id IS NULL
    `);
    await runner.query(`
      ALTER TABLE steward_session_events
      ALTER COLUMN external_event_id SET NOT NULL
    `);
    await runner.query(`DROP INDEX IF EXISTS uq_steward_events_tenant_source`);
    await runner.query(`
      CREATE INDEX idx_steward_events_source_ref
      ON steward_session_events(tenant_id, source_service, source_ref)
    `);
    await runner.query(`
      CREATE UNIQUE INDEX uq_steward_events_external_event
      ON steward_session_events(tenant_id, source_service, external_event_id)
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP INDEX IF EXISTS uq_steward_events_external_event`);
    await runner.query(`DROP INDEX IF EXISTS idx_steward_events_source_ref`);
    await runner.query(`
      CREATE UNIQUE INDEX uq_steward_events_tenant_source
      ON steward_session_events(tenant_id, source_service, source_ref)
      WHERE source_ref IS NOT NULL
    `);
    await runner.query(`
      ALTER TABLE steward_session_events
      DROP COLUMN environment_id,
      DROP COLUMN external_event_id
    `);
    await runner.query(`DROP INDEX IF EXISTS idx_steward_sessions_correlation`);
    await runner.query(`ALTER TABLE steward_sessions DROP COLUMN workflow_id`);
  }
}
