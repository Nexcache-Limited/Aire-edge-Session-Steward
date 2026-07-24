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

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'evidence_kind', type: 'text', nullable: true })
  evidenceKind!: string | null;

  @Column({ name: 'source_service', type: 'text', nullable: true })
  sourceService!: string | null;

  @Column({ name: 'source_event_id', type: 'uuid', nullable: true })
  sourceEventId!: string | null;

  @Column({ name: 'source_ref', type: 'text', nullable: true })
  sourceRef!: string | null;

  @Column({ name: 'metric_set', type: 'jsonb', nullable: true })
  metricSet!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  artifact!: Record<string, unknown> | null;

  @Column({ name: 'freshness_expires_at', type: 'timestamptz', nullable: true })
  freshnessExpiresAt!: Date | null;

  @Column({ type: 'jsonb' })
  value!: Record<string, unknown>;

  @Column({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
