import type { SessionInterventionRecord } from '../../../domain/session-engine/session-types';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('steward_session_interventions')
@Index('idx_steward_interventions_session_status', ['sessionId', 'status'])
export class SessionInterventionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @Column({ type: 'text', default: 'open' })
  status!: SessionInterventionRecord['status'];

  @Column({ name: 'recommendation_text', type: 'text' })
  recommendationText!: string;

  @Column({ name: 'trigger_reason', type: 'jsonb' })
  triggerReason!: Record<string, unknown>;

  @Column({ name: 'evidence_ids', type: 'uuid', array: true, default: [] })
  evidenceIds!: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;
}
