import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContractTemplatesAndProgression1784892000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE steward_session_contract_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        objective_id TEXT,
        objective_type TEXT,
        steps JSONB NOT NULL,
        success_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await runner.query(`
      CREATE INDEX idx_steward_templates_tenant_updated
      ON steward_session_contract_templates(tenant_id, updated_at DESC)
    `);
    await runner.query(`
      ALTER TABLE steward_session_contracts
      ADD COLUMN description TEXT NOT NULL DEFAULT '',
      ADD COLUMN objective_id TEXT,
      ADD COLUMN objective_type TEXT,
      ADD COLUMN template_id UUID REFERENCES steward_session_contract_templates(id) ON DELETE SET NULL
    `);
    await runner.query(`
      ALTER TABLE steward_session_contract_steps
      ADD COLUMN description TEXT NOT NULL DEFAULT '',
      ADD COLUMN expected_evidence_kinds JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN freshness_requirement_seconds INTEGER,
      ADD COLUMN success_criterion_key TEXT,
      ADD COLUMN operator_rationale TEXT
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE steward_session_contract_steps
      DROP COLUMN operator_rationale,
      DROP COLUMN success_criterion_key,
      DROP COLUMN freshness_requirement_seconds,
      DROP COLUMN expected_evidence_kinds,
      DROP COLUMN description
    `);
    await runner.query(`
      ALTER TABLE steward_session_contracts
      DROP COLUMN template_id,
      DROP COLUMN objective_type,
      DROP COLUMN objective_id,
      DROP COLUMN description
    `);
    await runner.query(`DROP TABLE steward_session_contract_templates`);
  }
}
