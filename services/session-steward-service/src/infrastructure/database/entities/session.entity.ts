import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('steward_sessions')
@Index('idx_steward_sessions_tenant_status', ['tenantId', 'status'])
export class SessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'environment_id', type: 'uuid', nullable: true })
  environmentId!: string | null;

  @Column({ type: 'text' })
  objective!: string;

  @Column({ name: 'workflow_type', type: 'text' })
  workflowType!: string;

  @Column({ type: 'text', default: 'active' })
  status!: string;

  @Column({ name: 'active_contract_id', type: 'uuid', nullable: true })
  activeContractId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
