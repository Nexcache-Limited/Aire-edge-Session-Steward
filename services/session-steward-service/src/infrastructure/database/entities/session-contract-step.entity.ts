import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('steward_session_contract_steps')
@Unique('uq_steward_step_contract_order', ['contractId', 'stepOrder'])
@Unique('uq_steward_step_contract_key', ['contractId', 'stepKey'])
@Index('idx_steward_steps_contract', ['contractId'])
export class SessionContractStepEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'contract_id', type: 'uuid' })
  contractId!: string;

  @Column({ name: 'step_order', type: 'integer' })
  stepOrder!: number;

  @Column({ name: 'step_key', type: 'text' })
  stepKey!: string;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text', default: '' })
  description?: string;

  @Column({ name: 'expected_event_type', type: 'text' })
  expectedEventType!: string;

  @Column({ name: 'expected_evidence_kinds', type: 'jsonb', default: [] })
  expectedEvidenceKinds?: string[];

  @Column({ name: 'freshness_requirement_seconds', type: 'integer', nullable: true })
  freshnessRequirementSeconds?: number | null;

  @Column({ name: 'success_criterion_key', type: 'text', nullable: true })
  successCriterionKey?: string | null;

  @Column({ name: 'operator_rationale', type: 'text', nullable: true })
  operatorRationale?: string | null;

  @Column({ name: 'max_wait_seconds', type: 'integer', nullable: true })
  maxWaitSeconds!: number | null;

  @Column({ type: 'boolean', default: true })
  required!: boolean;

  @Column({ name: 'success_rule', type: 'jsonb', default: {} })
  successRule!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
