import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  SessionAssessmentEntity,
  SessionContractEntity,
  SessionContractStepEntity,
  SessionEntity,
  SessionEventEntity,
  SessionEvidenceEntity,
} from '../infrastructure/database/entities';

const assessmentView = (assessment: SessionAssessmentEntity | null) =>
  assessment
    ? {
        state: assessment.state,
        confidence: Number(assessment.confidence),
        completionPercent: Number(assessment.completionPercent),
        expectedStepKey: assessment.expectedStepKey,
        rationale: assessment.rationale,
        assessedAt: assessment.assessedAt.toISOString(),
      }
    : null;

const payloadAliases: Record<string, string[]> = {
  status: ['status'],
  rolloutStatus: ['rolloutStatus', 'rollout_status'],
  healthStatus: ['healthStatus', 'health_status', 'overall_status'],
  freshnessSeconds: ['freshnessSeconds', 'freshness_seconds'],
  completedNodes: ['completedNodes', 'completed_nodes'],
  targetNodes: ['targetNodes', 'target_nodes'],
  phase: ['phase'],
};

const timelinePayload = (payload: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(payloadAliases).flatMap(([canonical, aliases]) => {
      const alias = aliases.find((candidate) => candidate in payload);
      return alias ? [[canonical, payload[alias]]] : [];
    }),
  );

const evidenceView = (evidence: SessionEvidenceEntity) => ({
  id: evidence.id,
  kind: evidence.evidenceKind,
  sourceService: evidence.sourceService,
  sourceEventId: evidence.sourceEventId,
  sourceRef: evidence.sourceRef,
  metricSet: evidence.metricSet,
  artifact: evidence.artifact,
  freshnessExpiresAt: evidence.freshnessExpiresAt?.toISOString() ?? null,
  recordedAt: evidence.recordedAt.toISOString(),
  createdAt: evidence.createdAt.toISOString(),
});

const evidenceSummary = (evidence: SessionEvidenceEntity[]) => {
  const present = (kind: string) => evidence.some((item) => item.evidenceKind === kind);
  const latestMetrics = [...evidence]
    .reverse()
    .find((item) => item.evidenceKind === 'post_change_qoe')?.metricSet;
  const comparisonMetrics = [...evidence]
    .reverse()
    .find((item) => item.evidenceKind === 'qoe_comparison')?.metricSet;
  return {
    baselinePresent: present('baseline_qoe'),
    postChangeValidationPresent: present('post_change_qoe'),
    comparisonPresent: present('qoe_comparison'),
    recommendationPresent: present('promotion_recommendation'),
    latestQoeScore: latestMetrics?.qoeScore ?? null,
    latestPacketLossPct: latestMetrics?.packetLossPct ?? null,
    comparisonDeltaPct: comparisonMetrics?.comparisonDeltaPct ?? null,
  };
};

const operatorProgressionState = (state: string | undefined) => {
  if (state === 'legitimate_wait') return 'progressing';
  if (state === 'failed') return 'intervention_required';
  return state ?? 'progressing';
};

@Injectable()
export class SessionsQueryService {
  constructor(
    @InjectRepository(SessionEntity)
    private readonly sessions: Repository<SessionEntity>,
    @InjectRepository(SessionContractEntity)
    private readonly contracts: Repository<SessionContractEntity>,
    @InjectRepository(SessionContractStepEntity)
    private readonly steps: Repository<SessionContractStepEntity>,
    @InjectRepository(SessionEventEntity)
    private readonly events: Repository<SessionEventEntity>,
    @InjectRepository(SessionAssessmentEntity)
    private readonly assessments: Repository<SessionAssessmentEntity>,
    @InjectRepository(SessionEvidenceEntity)
    private readonly evidence: Repository<SessionEvidenceEntity>,
  ) {}

  async listActive(tenantId: string) {
    const sessions = await this.sessions.find({
      where: { tenantId, status: 'active' },
      order: { updatedAt: 'DESC' },
    });
    return Promise.all(
      sessions.map(async (session) => ({
        id: session.id,
        objective: session.objective,
        workflowType: session.workflowType,
        workflowId: session.workflowId,
        status: session.status,
        lastAssessment: assessmentView(
          await this.assessments.findOne({
            where: { sessionId: session.id },
            order: { assessedAt: 'DESC' },
          }),
        ),
      })),
    );
  }

  async detail(tenantId: string, sessionId: string) {
    const session = await this.requireSession(tenantId, sessionId);
    const contract = session.activeContractId
      ? await this.contracts.findOne({ where: { id: session.activeContractId } })
      : await this.contracts.findOne({
          where: { sessionId },
          order: { version: 'DESC' },
        });
    const [steps, lastAssessment, evidence] = await Promise.all([
      contract
        ? this.steps.find({ where: { contractId: contract.id }, order: { stepOrder: 'ASC' } })
        : Promise.resolve([]),
      this.assessments.findOne({
        where: { sessionId },
        order: { assessedAt: 'DESC' },
      }),
      this.evidence.find({ where: { sessionId, tenantId }, order: { recordedAt: 'ASC' } }),
    ]);

    return {
      id: session.id,
      tenantId: session.tenantId,
      environmentId: session.environmentId,
      objective: session.objective,
      workflowType: session.workflowType,
      workflowId: session.workflowId,
      status: session.status,
      contract: contract
        ? {
            id: contract.id,
            name: contract.name,
            description: contract.description ?? '',
            version: contract.version,
            templateId: contract.templateId ?? null,
            objectiveId: contract.objectiveId ?? null,
            objectiveType: contract.objectiveType ?? null,
            steps: steps.map((step) => ({
              key: step.stepKey,
              title: step.title,
              description: step.description ?? '',
              order: step.stepOrder,
              expectedEventType: step.expectedEventType,
              expectedEvidenceKinds: step.expectedEvidenceKinds ?? [],
              freshnessRequirementSeconds: step.freshnessRequirementSeconds,
              successCriterionKey: step.successCriterionKey,
              operatorRationale: step.operatorRationale,
              maxWaitSeconds: step.maxWaitSeconds,
              required: step.required,
              status:
                lastAssessment?.rationale.contractSteps?.find(
                  (assessment) => assessment.stepKey === step.stepKey,
                ) ?? null,
            })),
          }
        : null,
      lastAssessment: assessmentView(lastAssessment),
      progression: {
        state: operatorProgressionState(lastAssessment?.state),
        rationaleSummary:
          lastAssessment?.rationale.rationaleSummary ?? 'Waiting for the first assessment.',
        recommendedNextAction:
          lastAssessment?.rationale.recommendedNextAction ??
          'Collect the first contracted objective evidence.',
        completionPercent: Number(lastAssessment?.completionPercent ?? 0),
        expectedStepKey: lastAssessment?.expectedStepKey ?? null,
      },
      evidenceSummary: {
        ...evidenceSummary(evidence),
        satisfiedContractSteps:
          lastAssessment?.rationale.contractSteps?.filter((step) => step.status === 'satisfied')
            .length ?? 0,
        totalContractSteps: steps.length,
      },
    };
  }

  async evidenceList(tenantId: string, sessionId: string) {
    await this.requireSession(tenantId, sessionId);
    const evidence = await this.evidence.find({
      where: { sessionId, tenantId },
      order: { recordedAt: 'ASC' },
    });
    return {
      summary: evidenceSummary(evidence),
      records: evidence.map(evidenceView),
    };
  }

  async timeline(tenantId: string, sessionId: string) {
    await this.requireSession(tenantId, sessionId);
    const events = await this.events.find({
      where: { sessionId, tenantId },
      order: { occurredAt: 'ASC' },
    });
    return events.map((event) => ({
      id: event.id,
      normalizedEventType: event.normalizedEventType,
      occurredAt: event.occurredAt.toISOString(),
      sourceService: event.sourceService,
      sourceRef: event.sourceRef,
      payload: timelinePayload(event.payload),
    }));
  }

  async assessmentHistory(tenantId: string, sessionId: string, limit = 25) {
    await this.requireSession(tenantId, sessionId);
    const assessments = await this.assessments.find({
      where: { sessionId },
      order: { assessedAt: 'DESC' },
      take: Math.max(1, Math.min(limit, 100)),
    });
    return assessments.reverse().map((assessment) => ({
      id: assessment.id,
      ...assessmentView(assessment),
    }));
  }

  private async requireSession(tenantId: string, sessionId: string): Promise<SessionEntity> {
    const session = await this.sessions.findOne({ where: { id: sessionId, tenantId } });
    if (!session) throw new NotFoundException(`Session ${sessionId} was not found`);
    return session;
  }
}
