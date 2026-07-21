import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('steward_session_evidence')
@Index('idx_steward_evidence_session_created', ['sessionId', 'createdAt'])
export class SessionEvidenceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @Column({ name: 'evidence_type', type: 'text' })
  evidenceType!: string;

  @Column({ name: 'source_event_id', type: 'uuid', nullable: true })
  sourceEventId!: string | null;

  @Column({ name: 'freshness_expires_at', type: 'timestamptz', nullable: true })
  freshnessExpiresAt!: Date | null;

  @Column({ type: 'jsonb' })
  value!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
