import type {
  SessionContractRecord,
  SessionContractStepRecord,
  SessionEventRecord,
  SessionEvidenceRecord,
  SessionRecord,
  SessionSuccessCriterionRecord,
} from '../domain/session-engine/session-types';
import {
  SessionContractEntity,
  SessionContractStepEntity,
  SessionEntity,
  SessionEventEntity,
  SessionEvidenceEntity,
  SessionSuccessCriterionEntity,
} from '../infrastructure/database/entities';

export const toSessionRecord = (entity: SessionEntity): SessionRecord => ({
  id: entity.id,
  tenantId: entity.tenantId,
  environmentId: entity.environmentId ?? undefined,
  objective: entity.objective,
  workflowType: entity.workflowType,
  workflowId: entity.workflowId ?? undefined,
  status: entity.status,
  activeContractId: entity.activeContractId ?? undefined,
  createdAt: entity.createdAt.toISOString(),
  updatedAt: entity.updatedAt.toISOString(),
});

export const toContractRecord = (entity: SessionContractEntity): SessionContractRecord => ({
  id: entity.id,
  sessionId: entity.sessionId,
  version: entity.version,
  name: entity.name,
  createdAt: entity.createdAt.toISOString(),
});

export const toStepRecord = (entity: SessionContractStepEntity): SessionContractStepRecord => ({
  id: entity.id,
  contractId: entity.contractId,
  stepOrder: entity.stepOrder,
  stepKey: entity.stepKey,
  title: entity.title,
  expectedEventType: entity.expectedEventType,
  maxWaitSeconds: entity.maxWaitSeconds ?? undefined,
  required: entity.required,
  successRule: entity.successRule,
  createdAt: entity.createdAt.toISOString(),
});

export const toCriterionRecord = (
  entity: SessionSuccessCriterionEntity,
): SessionSuccessCriterionRecord => ({
  id: entity.id,
  contractId: entity.contractId,
  criterionKey: entity.criterionKey,
  metricName: entity.metricName,
  operator: entity.operator,
  thresholdValue:
    entity.thresholdValue === null ? undefined : Number(entity.thresholdValue),
  unit: entity.unit ?? undefined,
  createdAt: entity.createdAt.toISOString(),
});

export const toEventRecord = (entity: SessionEventEntity): SessionEventRecord => ({
  id: entity.id,
  sessionId: entity.sessionId ?? undefined,
  tenantId: entity.tenantId,
  sourceService: entity.sourceService,
  sourceEventType: entity.sourceEventType,
  normalizedEventType: entity.normalizedEventType,
  sourceRef: entity.sourceRef ?? undefined,
  workflowId: entity.workflowId ?? undefined,
  environmentId: entity.environmentId ?? undefined,
  occurredAt: entity.occurredAt.toISOString(),
  payload: entity.payload,
  ingestedAt: entity.ingestedAt.toISOString(),
});

export const toEvidenceRecord = (entity: SessionEvidenceEntity): SessionEvidenceRecord => ({
  id: entity.id,
  sessionId: entity.sessionId,
  evidenceType: entity.evidenceType,
  sourceEventId: entity.sourceEventId ?? undefined,
  freshnessExpiresAt: entity.freshnessExpiresAt?.toISOString(),
  value: entity.value,
  createdAt: entity.createdAt.toISOString(),
});
