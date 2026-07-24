import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  ContractTemplateCriterionDefinition,
  ContractTemplateStepDefinition,
  SessionContractEntity,
  SessionContractStepEntity,
  SessionContractTemplateEntity,
  SessionEntity,
  SessionSuccessCriterionEntity,
} from '../infrastructure/database/entities';
import { SessionEvaluationService } from './session-evaluation.service';

export interface CreateContractTemplateInput {
  name: string;
  description?: string;
  objectiveId?: string;
  objectiveType?: string;
  steps: ContractTemplateStepDefinition[];
  successCriteria?: ContractTemplateCriterionDefinition[];
}

export interface AssignContractInput {
  templateId: string;
  replaceExisting?: boolean;
  name?: string;
  description?: string;
  steps?: ContractTemplateStepDefinition[];
}

@Injectable()
export class ContractsService {
  constructor(
    @InjectRepository(SessionContractTemplateEntity)
    private readonly templates: Repository<SessionContractTemplateEntity>,
    @InjectRepository(SessionEntity)
    private readonly sessions: Repository<SessionEntity>,
    @InjectRepository(SessionContractEntity)
    private readonly contracts: Repository<SessionContractEntity>,
    @InjectRepository(SessionContractStepEntity)
    private readonly steps: Repository<SessionContractStepEntity>,
    @InjectRepository(SessionSuccessCriterionEntity)
    private readonly criteria: Repository<SessionSuccessCriterionEntity>,
    private readonly evaluation: SessionEvaluationService,
  ) {}

  async createTemplate(
    tenantId: string,
    input: CreateContractTemplateInput,
    createdBy?: string,
  ) {
    this.validateDefinition(input);
    return this.templates.save(
      this.templates.create({
        tenantId,
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
        objectiveId: input.objectiveId ?? null,
        objectiveType: input.objectiveType ?? null,
        steps: input.steps,
        successCriteria: input.successCriteria ?? [],
        createdBy: createdBy ?? null,
      }),
    );
  }

  listTemplates(tenantId: string) {
    return this.templates.find({ where: { tenantId }, order: { updatedAt: 'DESC' } });
  }

  async templateDetail(tenantId: string, templateId: string) {
    const template = await this.templates.findOne({ where: { id: templateId, tenantId } });
    if (!template) throw new NotFoundException(`Contract template ${templateId} was not found`);
    return template;
  }

  async assign(tenantId: string, sessionId: string, input: AssignContractInput) {
    const session = await this.sessions.findOne({ where: { id: sessionId, tenantId } });
    if (!session) throw new NotFoundException(`Session ${sessionId} was not found`);
    if (session.activeContractId && !input.replaceExisting) {
      throw new ConflictException('Session already has a contract; set replaceExisting to create a new version');
    }
    const template = await this.templateDetail(tenantId, input.templateId);
    const definition = input.steps ?? template.steps;
    this.validateDefinition({ name: input.name ?? template.name, steps: definition });
    const previous = await this.contracts.findOne({
      where: { sessionId },
      order: { version: 'DESC' },
    });
    const contract = await this.contracts.save(
      this.contracts.create({
        sessionId,
        version: (previous?.version ?? 0) + 1,
        name: input.name?.trim() ?? template.name,
        description: input.description?.trim() ?? template.description,
        objectiveId: template.objectiveId,
        objectiveType: template.objectiveType,
        templateId: template.id,
      }),
    );
    await this.steps.save(
      definition.map((step, index) =>
        this.steps.create({
          contractId: contract.id,
          stepOrder: index,
          stepKey: step.key,
          title: step.title,
          description: step.description ?? '',
          expectedEventType: step.expectedEventType,
          expectedEvidenceKinds: step.expectedEvidenceKinds ?? [],
          freshnessRequirementSeconds: step.freshnessRequirementSeconds ?? null,
          successCriterionKey: step.successCriterionKey ?? null,
          operatorRationale: step.operatorRationale ?? null,
          maxWaitSeconds: step.maxWaitSeconds ?? null,
          required: step.required ?? true,
          successRule: step.successRule ?? {},
        }),
      ),
    );
    await this.criteria.save(
      template.successCriteria.map((criterion) =>
        this.criteria.create({
          contractId: contract.id,
          criterionKey: criterion.key,
          metricName: criterion.metricName,
          operator: criterion.operator,
          thresholdValue: criterion.thresholdValue ?? null,
          unit: criterion.unit ?? null,
        }),
      ),
    );
    session.activeContractId = contract.id;
    await this.sessions.save(session);
    const assessment = await this.evaluation.evaluate(session.id, new Date().toISOString());
    return { contract, steps: definition, sourceTemplateId: template.id, assessment };
  }

  private validateDefinition(input: Pick<CreateContractTemplateInput, 'name' | 'steps'>) {
    if (!input.name?.trim()) throw new ConflictException('Contract name is required');
    if (!Array.isArray(input.steps) || input.steps.length === 0) {
      throw new ConflictException('At least one contract step is required');
    }
    const keys = new Set<string>();
    input.steps.forEach((step) => {
      if (!step.key || !step.title || !step.expectedEventType) {
        throw new ConflictException('Every contract step needs a key, title, and expected event type');
      }
      if (keys.has(step.key)) throw new ConflictException(`Duplicate contract step key: ${step.key}`);
      keys.add(step.key);
    });
  }
}
