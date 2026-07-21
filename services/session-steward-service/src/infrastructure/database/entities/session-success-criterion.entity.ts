import type { SessionSuccessCriterionOperator } from '../../../domain/session-engine/session-types';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('steward_session_success_criteria')
@Unique('uq_steward_criterion_contract_key', ['contractId', 'criterionKey'])
@Index('idx_steward_criteria_contract', ['contractId'])
export class SessionSuccessCriterionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'contract_id', type: 'uuid' })
  contractId!: string;

  @Column({ name: 'criterion_key', type: 'text' })
  criterionKey!: string;

  @Column({ name: 'metric_name', type: 'text' })
  metricName!: string;

  @Column({ type: 'text' })
  operator!: SessionSuccessCriterionOperator;

  @Column({ name: 'threshold_value', type: 'numeric', nullable: true })
  thresholdValue!: number | null;

  @Column({ type: 'text', nullable: true })
  unit!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
