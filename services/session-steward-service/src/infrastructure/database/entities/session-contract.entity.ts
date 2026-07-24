import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('steward_session_contracts')
@Unique('uq_steward_contract_session_version', ['sessionId', 'version'])
@Index('idx_steward_contracts_session', ['sessionId'])
export class SessionContractEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @Column({ type: 'integer' })
  version!: number;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', default: '' })
  description?: string;

  @Column({ name: 'objective_id', type: 'text', nullable: true })
  objectiveId?: string | null;

  @Column({ name: 'objective_type', type: 'text', nullable: true })
  objectiveType?: string | null;

  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  templateId?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
