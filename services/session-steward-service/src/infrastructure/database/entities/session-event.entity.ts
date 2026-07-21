import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('steward_session_events')
@Index('idx_steward_events_session_time', ['sessionId', 'occurredAt'])
@Index('idx_steward_events_workflow', ['workflowId'])
@Index('idx_steward_events_normalized_type', ['normalizedEventType'])
@Index('idx_steward_events_source_ref', ['tenantId', 'sourceService', 'sourceRef'])
@Index('uq_steward_events_external_event', ['tenantId', 'sourceService', 'externalEventId'], {
  unique: true,
})
export class SessionEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id', type: 'uuid', nullable: true })
  sessionId!: string | null;

  @Column({ name: 'external_event_id', type: 'text' })
  externalEventId!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'source_service', type: 'text' })
  sourceService!: string;

  @Column({ name: 'source_event_type', type: 'text' })
  sourceEventType!: string;

  @Column({ name: 'normalized_event_type', type: 'text' })
  normalizedEventType!: string;

  @Column({ name: 'source_ref', type: 'text', nullable: true })
  sourceRef!: string | null;

  @Column({ name: 'workflow_id', type: 'text', nullable: true })
  workflowId!: string | null;

  @Column({ name: 'environment_id', type: 'uuid', nullable: true })
  environmentId!: string | null;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @CreateDateColumn({ name: 'ingested_at' })
  ingestedAt!: Date;
}
