import type {
  SessionAssessmentDraft,
  SessionAssessmentSignal,
  SessionContractRecord,
  SessionContractStepRecord,
  SessionCriterionAssessment,
  SessionEventRecord,
  SessionEvidenceRecord,
  SessionRecord,
  SessionState,
  SessionSuccessCriterionOperator,
  SessionSuccessCriterionRecord,
} from './session-types';

export interface SessionEngineInput {
  session: SessionRecord;
  contract: SessionContractRecord;
  steps: SessionContractStepRecord[];
  successCriteria: SessionSuccessCriterionRecord[];
  events: SessionEventRecord[];
  evidence: SessionEvidenceRecord[];
  assessedAt?: string;
}

export interface SessionEngineConfig {
  defaultMaxWaitSeconds: number;
  evidenceStaleAfterSeconds: number;
  interventionConfidenceThreshold: number;
  repeatedNonProgressThreshold: number;
  recentProgressWindowSeconds: number;
}

interface StepCompletion {
  step: SessionContractStepRecord;
  event: SessionEventRecord;
  eventIndex: number;
}

const DEFAULT_CONFIG: SessionEngineConfig = {
  defaultMaxWaitSeconds: 10 * 60,
  evidenceStaleAfterSeconds: 15 * 60,
  interventionConfidenceThreshold: 55,
  repeatedNonProgressThreshold: 2,
  recentProgressWindowSeconds: 60,
};

function timestamp(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`${field} must be an ISO-8601 timestamp`);
  return parsed;
}

function elapsedSeconds(from: number, to: number): number {
  return Math.max(0, Math.floor((to - from) / 1000));
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function ruleMatches(event: SessionEventRecord, rule: Record<string, unknown>): boolean {
  const entries = Object.entries(rule);
  if (entries.length === 0) return true;

  const payloadRule = rule.payload;
  const expected =
    payloadRule && typeof payloadRule === 'object' && !Array.isArray(payloadRule)
      ? (payloadRule as Record<string, unknown>)
      : rule;

  return Object.entries(expected).every(([key, value]) => event.payload[key] === value);
}

function compare(
  observed: number,
  operator: SessionSuccessCriterionOperator,
  threshold: number,
): boolean {
  switch (operator) {
    case '>=':
      return observed >= threshold;
    case '<=':
      return observed <= threshold;
    case '>':
      return observed > threshold;
    case '<':
      return observed < threshold;
    case '=':
      return observed === threshold;
    default:
      throw new Error(`unsupported success criterion operator: ${String(operator)}`);
  }
}

function observedMetric(
  criterion: SessionSuccessCriterionRecord,
  evidence: SessionEvidenceRecord[],
): { evidence?: SessionEvidenceRecord; value?: number } {
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    const item = evidence[index];
    const namedValue = item.value[criterion.metricName];
    if (typeof namedValue === 'number') return { evidence: item, value: namedValue };

    const genericValue = item.value.value;
    if (item.evidenceType === criterion.metricName && typeof genericValue === 'number') {
      return { evidence: item, value: genericValue };
    }
  }
  return {};
}

export class SessionEngine {
  private readonly config: SessionEngineConfig;

  constructor(config: Partial<SessionEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  assess(input: SessionEngineInput): SessionAssessmentDraft {
    if (input.contract.sessionId !== input.session.id) {
      throw new Error('contract does not belong to the supplied session');
    }

    const assessedAt = input.assessedAt ?? new Date().toISOString();
    const assessedAtMs = timestamp(assessedAt, 'assessedAt');
    const steps = [...input.steps]
      .filter((step) => step.contractId === input.contract.id)
      .sort((left, right) => left.stepOrder - right.stepOrder);
    const requiredSteps = steps.filter((step) => step.required);
    const events = [...input.events]
      .filter(
        (event) =>
          event.tenantId === input.session.tenantId &&
          (!event.sessionId || event.sessionId === input.session.id),
      )
      .sort(
        (left, right) =>
          timestamp(left.occurredAt, 'event.occurredAt') -
          timestamp(right.occurredAt, 'event.occurredAt'),
      );
    const evidence = [...input.evidence]
      .filter((item) => item.sessionId === input.session.id)
      .sort(
        (left, right) =>
          timestamp(left.createdAt, 'evidence.createdAt') -
          timestamp(right.createdAt, 'evidence.createdAt'),
      );

    const completions = this.resolveCompletions(steps, events);
    const completedStepIds = new Set(completions.map(({ step }) => step.id));
    const completedRequired = requiredSteps.filter((step) => completedStepIds.has(step.id));
    const completionPercent =
      requiredSteps.length === 0
        ? 100
        : Math.round((completedRequired.length / requiredSteps.length) * 100);
    const expectedStep = requiredSteps.find((step) => !completedStepIds.has(step.id));
    const lastCompletion = completions.at(-1);
    const waitStartedAtMs = lastCompletion
      ? timestamp(lastCompletion.event.occurredAt, 'event.occurredAt')
      : timestamp(input.session.createdAt, 'session.createdAt');
    const waitAgeSeconds = elapsedSeconds(waitStartedAtMs, assessedAtMs);
    const waitLimitSeconds = expectedStep?.maxWaitSeconds ?? this.config.defaultMaxWaitSeconds;
    const overdue = Boolean(expectedStep) && waitAgeSeconds > waitLimitSeconds;
    const recentProgress =
      Boolean(lastCompletion) && waitAgeSeconds <= this.config.recentProgressWindowSeconds;

    const completionEventIds = new Set(completions.map(({ event }) => event.id));
    const nonProgressEvents = events.filter(
      (event) =>
        timestamp(event.occurredAt, 'event.occurredAt') > waitStartedAtMs &&
        !completionEventIds.has(event.id),
    );
    const eventTypeCounts = nonProgressEvents.reduce<Map<string, number>>((counts, event) => {
      counts.set(event.normalizedEventType, (counts.get(event.normalizedEventType) ?? 0) + 1);
      return counts;
    }, new Map());
    const repeatedNonProgressCount = Math.max(0, ...eventTypeCounts.values());

    const latestChangeAtMs = this.latestObjectiveChange(events);
    const latestEvidence = evidence.at(-1);
    const evidenceAgeSeconds = latestEvidence
      ? elapsedSeconds(timestamp(latestEvidence.createdAt, 'evidence.createdAt'), assessedAtMs)
      : elapsedSeconds(waitStartedAtMs, assessedAtMs);
    const evidenceExpired = Boolean(
      latestEvidence?.freshnessExpiresAt &&
      timestamp(latestEvidence.freshnessExpiresAt, 'evidence.freshnessExpiresAt') < assessedAtMs,
    );
    const evidencePredatesChange = Boolean(
      latestEvidence &&
      latestChangeAtMs &&
      timestamp(latestEvidence.createdAt, 'evidence.createdAt') < latestChangeAtMs,
    );
    const evidenceStale =
      !latestEvidence ||
      evidenceExpired ||
      evidencePredatesChange ||
      evidenceAgeSeconds > this.config.evidenceStaleAfterSeconds;

    const criterionEvidence = latestChangeAtMs
      ? evidence.filter(
          (item) => timestamp(item.createdAt, 'evidence.createdAt') >= latestChangeAtMs,
        )
      : evidence;
    const criterionAssessments = this.evaluateCriteria(input.successCriteria, criterionEvidence);
    const allCriteriaMet =
      criterionAssessments.length === 0 ||
      criterionAssessments.every((criterion) => criterion.status === 'met');
    const anyCriteriaNotMet = criterionAssessments.some(
      (criterion) => criterion.status === 'not_met',
    );
    const allRequiredComplete = completedRequired.length === requiredSteps.length;
    const recoveredFromOverdueStep = this.hasLateRecovery(completions);

    let confidence = 96;
    if (expectedStep && !recentProgress) confidence -= 4;
    if (repeatedNonProgressCount >= this.config.repeatedNonProgressThreshold) {
      confidence -= 16 + (repeatedNonProgressCount - this.config.repeatedNonProgressThreshold) * 4;
    }
    if (overdue) confidence -= 25;
    if (evidenceStale && (overdue || repeatedNonProgressCount > 0)) confidence -= 15;
    confidence -=
      criterionAssessments.filter((criterion) => criterion.status === 'not_met').length * 20;
    confidence = clamp(confidence);

    let state: SessionState;
    if (allRequiredComplete && allCriteriaMet) {
      state = 'completed';
      confidence = Math.max(confidence, 95);
    } else if (allRequiredComplete && anyCriteriaNotMet) {
      state = 'failed';
    } else if (recoveredFromOverdueStep && recentProgress) {
      state = 'recovered';
      confidence = Math.max(confidence, 82);
    } else if (overdue && confidence <= this.config.interventionConfidenceThreshold) {
      state = 'intervention_required';
    } else if (
      overdue ||
      repeatedNonProgressCount >= this.config.repeatedNonProgressThreshold ||
      (evidenceStale && waitAgeSeconds > this.config.evidenceStaleAfterSeconds)
    ) {
      state = 'attention_needed';
    } else if (recentProgress) {
      state = 'progressing';
    } else {
      state = 'legitimate_wait';
    }

    const signals = this.buildSignals({
      state,
      expectedStep,
      overdue,
      waitAgeSeconds,
      evidenceStale,
      evidenceAgeSeconds,
      latestEvidence,
      repeatedNonProgressCount,
      criterionAssessments,
      recoveredFromOverdueStep,
    });

    return {
      sessionId: input.session.id,
      state,
      confidence,
      expectedStepKey: expectedStep?.stepKey,
      completionPercent,
      rationale: {
        signals,
        staleEvidenceAgeSeconds: evidenceStale ? evidenceAgeSeconds : undefined,
        repeatedNonProgressCount,
        successCriteria: criterionAssessments,
      },
      assessedAt,
    };
  }

  private resolveCompletions(
    steps: SessionContractStepRecord[],
    events: SessionEventRecord[],
  ): StepCompletion[] {
    const completions: StepCompletion[] = [];
    let cursor = -1;

    steps.some((step) => {
      const relativeIndex = events
        .slice(cursor + 1)
        .findIndex(
          (event) =>
            event.normalizedEventType === step.expectedEventType &&
            ruleMatches(event, step.successRule),
        );

      if (relativeIndex === -1) {
        return step.required;
      }

      cursor += relativeIndex + 1;
      completions.push({ step, event: events[cursor], eventIndex: cursor });
      return false;
    });

    return completions;
  }

  private latestObjectiveChange(events: SessionEventRecord[]): number | undefined {
    const change = [...events]
      .reverse()
      .find((event) =>
        ['deployment.started', 'deployment.completed', 'routing.changed'].includes(
          event.normalizedEventType,
        ),
      );
    return change ? timestamp(change.occurredAt, 'event.occurredAt') : undefined;
  }

  private evaluateCriteria(
    criteria: SessionSuccessCriterionRecord[],
    evidence: SessionEvidenceRecord[],
  ): SessionCriterionAssessment[] {
    return criteria.map((criterion) => {
      const observed = observedMetric(criterion, evidence);
      if (observed.value === undefined || criterion.thresholdValue === undefined) {
        return {
          criterionKey: criterion.criterionKey,
          status: 'pending',
          thresholdValue: criterion.thresholdValue,
        };
      }

      return {
        criterionKey: criterion.criterionKey,
        status: compare(observed.value, criterion.operator, criterion.thresholdValue)
          ? 'met'
          : 'not_met',
        observedValue: observed.value,
        thresholdValue: criterion.thresholdValue,
      };
    });
  }

  private hasLateRecovery(completions: StepCompletion[]): boolean {
    for (let index = 1; index < completions.length; index += 1) {
      const previous = completions[index - 1];
      const current = completions[index];
      const limit = current.step.maxWaitSeconds ?? this.config.defaultMaxWaitSeconds;
      const gap = elapsedSeconds(
        timestamp(previous.event.occurredAt, 'event.occurredAt'),
        timestamp(current.event.occurredAt, 'event.occurredAt'),
      );
      if (gap > limit) return true;
    }
    return false;
  }

  private buildSignals(input: {
    state: SessionState;
    expectedStep?: SessionContractStepRecord;
    overdue: boolean;
    waitAgeSeconds: number;
    evidenceStale: boolean;
    evidenceAgeSeconds: number;
    latestEvidence?: SessionEvidenceRecord;
    repeatedNonProgressCount: number;
    criterionAssessments: SessionCriterionAssessment[];
    recoveredFromOverdueStep: boolean;
  }): SessionAssessmentSignal[] {
    const signals: SessionAssessmentSignal[] = [];

    if (input.expectedStep) {
      signals.push({
        code: 'expected_step',
        severity: 'info',
        message: `Expected next: ${input.expectedStep.title}`,
      });
    }
    if (input.repeatedNonProgressCount >= this.config.repeatedNonProgressThreshold) {
      signals.push({
        code: 'repeated_non_progress',
        severity: 'warning',
        message: `${input.repeatedNonProgressCount} repeated events produced no contract progress`,
      });
    }
    if (input.evidenceStale) {
      signals.push({
        code: 'evidence_stale',
        severity: input.overdue ? 'critical' : 'warning',
        message: `Objective evidence is ${input.evidenceAgeSeconds} seconds old`,
        evidenceIds: input.latestEvidence ? [input.latestEvidence.id] : undefined,
      });
    }
    if (input.overdue && input.expectedStep) {
      signals.push({
        code: 'validation_overdue',
        severity: 'critical',
        message: `${input.expectedStep.title} is overdue after ${input.waitAgeSeconds} seconds`,
      });
    }
    if (input.state === 'intervention_required') {
      signals.push({
        code: 'missing_follow_through',
        severity: 'critical',
        message: 'Infrastructure activity continues, but the required objective step is missing',
      });
    }
    if (input.state === 'recovered' && input.recoveredFromOverdueStep) {
      signals.push({
        code: 'recovery_detected',
        severity: 'info',
        message: 'A previously overdue contract step has now completed',
      });
    }

    const metCount = input.criterionAssessments.filter(
      (criterion) => criterion.status === 'met',
    ).length;
    if (metCount > 0) {
      signals.push({
        code: 'success_criteria_met',
        severity: 'info',
        message: `${metCount} of ${input.criterionAssessments.length} success criteria are met`,
      });
    }

    return signals;
  }
}
