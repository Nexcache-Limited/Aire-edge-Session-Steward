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
  SessionInterventionEntity,
  SessionSuccessCriterionEntity,
} from '../infrastructure/database/entities';
import {
  toContractRecord,
  toCriterionRecord,
  toEventRecord,
  toEvidenceRecord,
  toSessionRecord,
  toStepRecord,
} from './session-entity-mappers';
import { SessionAssessmentService } from './session-assessment.service';

@Injectable()
export class SessionEvaluationService {
  constructor(
    @InjectRepository(SessionEntity)
    private readonly sessions: Repository<SessionEntity>,
    @InjectRepository(SessionContractEntity)
    private readonly contracts: Repository<SessionContractEntity>,
    @InjectRepository(SessionContractStepEntity)
    private readonly steps: Repository<SessionContractStepEntity>,
    @InjectRepository(SessionSuccessCriterionEntity)
    private readonly criteria: Repository<SessionSuccessCriterionEntity>,
    @InjectRepository(SessionEventEntity)
    private readonly events: Repository<SessionEventEntity>,
    @InjectRepository(SessionEvidenceEntity)
    private readonly evidence: Repository<SessionEvidenceEntity>,
    @InjectRepository(SessionAssessmentEntity)
    private readonly assessments: Repository<SessionAssessmentEntity>,
    @InjectRepository(SessionInterventionEntity)
    private readonly interventions: Repository<SessionInterventionEntity>,
    private readonly assessmentService: SessionAssessmentService,
  ) {}

  async evaluate(sessionId: string, assessedAt: string): Promise<SessionAssessmentEntity> {
    const session = await this.sessions.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException(`Session ${sessionId} was not found`);

    const contract = session.activeContractId
      ? await this.contracts.findOne({ where: { id: session.activeContractId } })
      : await this.contracts.findOne({
          where: { sessionId },
          order: { version: 'DESC' },
        });
    if (!contract) throw new NotFoundException(`Session ${sessionId} has no contract`);

    const [steps, criteria, events, evidence, previous] = await Promise.all([
      this.steps.find({ where: { contractId: contract.id }, order: { stepOrder: 'ASC' } }),
      this.criteria.find({ where: { contractId: contract.id } }),
      this.events.find({ where: { sessionId }, order: { occurredAt: 'ASC' } }),
      this.evidence.find({ where: { sessionId }, order: { createdAt: 'ASC' } }),
      this.assessments.findOne({ where: { sessionId }, order: { assessedAt: 'DESC' } }),
    ]);

    const effectiveAssessedAt = events.reduce(
      (latest, event) =>
        event.occurredAt.getTime() > Date.parse(latest) ? event.occurredAt.toISOString() : latest,
      assessedAt,
    );

    const draft = this.assessmentService.assess({
      session: toSessionRecord(session),
      contract: toContractRecord(contract),
      steps: steps.map(toStepRecord),
      successCriteria: criteria.map(toCriterionRecord),
      events: events.map(toEventRecord),
      evidence: evidence.map(toEvidenceRecord),
      assessedAt: effectiveAssessedAt,
    });
    const assessment = await this.assessments.save(
      this.assessments.create({
        sessionId,
        state: draft.state,
        confidence: draft.confidence,
        expectedStepKey: draft.expectedStepKey ?? null,
        completionPercent: draft.completionPercent,
        rationale: draft.rationale,
        assessedAt: new Date(draft.assessedAt),
      }),
    );

    if (draft.state === 'intervention_required' && previous?.state !== draft.state) {
      await this.writeIntervention(sessionId, assessment);
    }

    return assessment;
  }

  private async writeIntervention(
    sessionId: string,
    assessment: SessionAssessmentEntity,
  ): Promise<void> {
    const missingFollowThrough = assessment.rationale.signals.find(
      (signal) => signal.code === 'missing_follow_through',
    );
    if (!missingFollowThrough) return;

    const existing = await this.interventions.findOne({
      where: { sessionId, status: 'open' },
    });
    if (existing) return;

    await this.interventions.save(
      this.interventions.create({
        sessionId,
        status: 'open',
        recommendationText: 'Begin the expected validation step before promotion continues.',
        triggerReason: {
          assessmentId: assessment.id,
          signal: missingFollowThrough,
        },
        evidenceIds: assessment.rationale.signals.flatMap(
          (signal) => signal.evidenceIds ?? [],
        ),
        resolvedAt: null,
      }),
    );
  }
}
