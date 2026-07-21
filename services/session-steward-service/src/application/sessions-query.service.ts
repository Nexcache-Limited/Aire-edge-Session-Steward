import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  SessionAssessmentEntity,
  SessionContractEntity,
  SessionContractStepEntity,
  SessionEntity,
  SessionEventEntity,
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
    const [steps, lastAssessment] = await Promise.all([
      contract
        ? this.steps.find({ where: { contractId: contract.id }, order: { stepOrder: 'ASC' } })
        : Promise.resolve([]),
      this.assessments.findOne({
        where: { sessionId },
        order: { assessedAt: 'DESC' },
      }),
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
            version: contract.version,
            steps: steps.map((step) => ({
              key: step.stepKey,
              title: step.title,
              order: step.stepOrder,
              expectedEventType: step.expectedEventType,
              maxWaitSeconds: step.maxWaitSeconds,
              required: step.required,
            })),
          }
        : null,
      lastAssessment: assessmentView(lastAssessment),
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
