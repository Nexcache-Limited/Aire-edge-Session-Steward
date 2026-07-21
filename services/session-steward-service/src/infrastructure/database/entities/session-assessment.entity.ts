import type {
  SessionAssessmentRecord,
  SessionState,
} from '../../../domain/session-engine/session-types';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('steward_session_assessments')
@Index('idx_steward_assessments_session_time', ['sessionId', 'assessedAt'])
export class SessionAssessmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @Column({ type: 'text' })
  state!: SessionState;

  @Column({ type: 'numeric', precision: 5, scale: 2 })
  confidence!: number;

  @Column({ name: 'expected_step_key', type: 'text', nullable: true })
  expectedStepKey!: string | null;

  @Column({ name: 'completion_percent', type: 'numeric', precision: 5, scale: 2 })
  completionPercent!: number;

  @Column({ type: 'jsonb' })
  rationale!: SessionAssessmentRecord['rationale'];

  @CreateDateColumn({ name: 'assessed_at' })
  assessedAt!: Date;
}
