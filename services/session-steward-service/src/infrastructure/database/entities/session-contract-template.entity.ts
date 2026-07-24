import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export interface ContractTemplateStepDefinition {
  key: string;
  title: string;
  description?: string;
  expectedEventType: string;
  expectedEvidenceKinds?: string[];
  freshnessRequirementSeconds?: number;
  successCriterionKey?: string;
  operatorRationale?: string;
  maxWaitSeconds?: number;
  required?: boolean;
  successRule?: Record<string, unknown>;
}

export interface ContractTemplateCriterionDefinition {
  key: string;
  metricName: string;
  operator: '>=' | '<=' | '>' | '<' | '=';
  thresholdValue?: number;
  unit?: string;
}

@Entity('steward_session_contract_templates')
@Index('idx_steward_templates_tenant_updated', ['tenantId', 'updatedAt'])
export class SessionContractTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column({ name: 'objective_id', type: 'text', nullable: true })
  objectiveId!: string | null;

  @Column({ name: 'objective_type', type: 'text', nullable: true })
  objectiveType!: string | null;

  @Column({ type: 'jsonb' })
  steps!: ContractTemplateStepDefinition[];

  @Column({ name: 'success_criteria', type: 'jsonb', default: [] })
  successCriteria!: ContractTemplateCriterionDefinition[];

  @Column({ name: 'created_by', type: 'text', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
