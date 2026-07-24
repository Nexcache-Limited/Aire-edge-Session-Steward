import type {
  SessionAssessmentDraft,
  SessionAssessmentSignal,
  ContractStepAssessment,
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
    const metricSet = item.metricSet as Record<string, unknown> | undefined;
    const metricAliases: Record<string, string[]> = {
      qoe_score: ['qoeScore'],
      packet_loss_pct: ['packetLossPct'],
      qoe_improvement_pct: ['comparisonDeltaPct'],
      bandwidth_tiers: ['bandwidthTiers'],
    };
    const metricValue = [criterion.metricName, ...(metricAliases[criterion.metricName] ?? [])]
      .map((key) => metricSet?.[key])
      .find((value) => typeof value === 'number');
    if (typeof metricValue === 'number') return { evidence: item, value: metricValue };
    const namedValue = item.value[criterion.metricName];
    if (typeof namedValue === 'number') return { evidence: item, value: namedValue };

    const genericValue = item.value.value;
    if (item.evidenceType === criterion.metricName && typeof genericValue === 'number') {
      return { evidence: item, value: genericValue };
    }
  }
  return {};
}

const objectiveKinds = new Set([
  'baseline_qoe',
  'post_change_qoe',
  'qoe_comparison',
  'promotion_recommendation',
]);

function isObjectiveEvidence(item: SessionEvidenceRecord): boolean {
  return (
    (item.evidenceKind !== undefined && objectiveKinds.has(item.evidenceKind)) ||
    item.sourceService === 'qoe-service' ||
    item.evidenceType.includes('qoe')
  );
}

function evidenceTimestamp(item: SessionEvidenceRecord): number {
  return timestamp(item.recordedAt ?? item.createdAt, 'evidence.recordedAt');
}

interface ObjectiveEvidenceFacts {
  baseline: SessionEvidenceRecord[];
  postChange: SessionEvidenceRecord[];
  comparison?: SessionEvidenceRecord;
  recommendation?: SessionEvidenceRecord;
  recommendationJustified: boolean;
  bandwidthTierCount: number;
  maxPacketLossPct?: number;
  qoeDeltaPct?: number;
}

function metric(item: SessionEvidenceRecord, key: string, legacyKey: string): number | undefined {
  const metricValue = (item.metricSet as Record<string, unknown> | undefined)?.[key];
  if (typeof metricValue === 'number') return metricValue;
  const value = item.value[legacyKey] ?? item.value[key];
  return typeof value === 'number' ? value : undefined;
}

function objectiveFacts(evidence: SessionEvidenceRecord[]): ObjectiveEvidenceFacts {
  const baseline = evidence.filter((item) => item.evidenceKind === 'baseline_qoe');
  const postChange = evidence.filter((item) => item.evidenceKind === 'post_change_qoe');
  const comparison = [...evidence]
    .reverse()
    .find((item) => item.evidenceKind === 'qoe_comparison');
  const recommendation = [...evidence]
    .reverse()
    .find((item) => item.evidenceKind === 'promotion_recommendation');
  const tiers = new Set(
    postChange
      .map((item) => item.metricSet?.bandwidthTier)
      .filter((tier): tier is 'low' | 'medium' | 'high' => tier !== undefined),
  );
  const explicitTierCount = postChange.reduce(
    (largest, item) => Math.max(largest, item.metricSet?.bandwidthTiers ?? 0),
    0,
  );
  const packetLossValues = postChange
    .map((item) => metric(item, 'packetLossPct', 'packet_loss_pct'))
    .filter((value): value is number => value !== undefined);
  const comparisonDelta = comparison
    ? metric(comparison, 'comparisonDeltaPct', 'qoe_improvement_pct')
    : undefined;
  const baselineScore = baseline.at(-1)
    ? metric(baseline.at(-1)!, 'qoeScore', 'qoe_score')
    : undefined;
  const postScore = postChange.at(-1)
    ? metric(postChange.at(-1)!, 'qoeScore', 'qoe_score')
    : undefined;
  const derivedDelta =
    baselineScore !== undefined && postScore !== undefined && baselineScore !== 0
      ? ((postScore - baselineScore) / baselineScore) * 100
      : undefined;
  return {
    baseline,
    postChange,
    comparison,
    recommendation,
    recommendationJustified: Boolean(recommendation && baseline.length && postChange.length && comparison),
    bandwidthTierCount: Math.max(tiers.size, explicitTierCount),
    maxPacketLossPct: packetLossValues.length ? Math.max(...packetLossValues) : undefined,
    qoeDeltaPct: comparisonDelta ?? derivedDelta,
  };
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
          evidenceTimestamp(left) - evidenceTimestamp(right),
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
    const objectiveEvidence = evidence.filter(isObjectiveEvidence);
    const latestEvidence = objectiveEvidence.at(-1);
    const evidenceAgeSeconds = latestEvidence
      ? elapsedSeconds(evidenceTimestamp(latestEvidence), assessedAtMs)
      : elapsedSeconds(waitStartedAtMs, assessedAtMs);
    const evidenceExpired = Boolean(
      latestEvidence?.freshnessExpiresAt &&
      timestamp(latestEvidence.freshnessExpiresAt, 'evidence.freshnessExpiresAt') < assessedAtMs,
    );
    const evidencePredatesChange = Boolean(
      latestEvidence &&
      latestChangeAtMs &&
      evidenceTimestamp(latestEvidence) < latestChangeAtMs,
    );
    const evidenceStale =
      !latestEvidence ||
      evidenceExpired ||
      evidencePredatesChange ||
      evidenceAgeSeconds > this.config.evidenceStaleAfterSeconds;

    const facts = objectiveFacts(evidence);
    const criterionAssessments = this.evaluateCriteria(input.successCriteria, evidence, facts);
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
    if (facts.recommendation && !facts.recommendationJustified) confidence -= 25;
    confidence = clamp(confidence);

    let state: SessionState;
    const recommendationUnjustified = Boolean(
      facts.recommendation && !facts.recommendationJustified,
    );
    if (allRequiredComplete && allCriteriaMet && !recommendationUnjustified) {
      state = 'completed';
      confidence = Math.max(confidence, 95);
    } else if (allRequiredComplete && anyCriteriaNotMet) {
      state = 'failed';
    } else if (allRequiredComplete && recommendationUnjustified) {
      state = 'attention_needed';
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
      facts,
    });
    const contractSteps = this.evaluateContractSteps(
      steps,
      completedStepIds,
      evidence,
      criterionAssessments,
      expectedStep,
      state,
      assessedAtMs,
    );
    const rationaleSummary = this.rationaleSummary(state, expectedStep, facts);
    const recommendedNextAction =
      state === 'completed'
        ? 'Approve the contracted promotion decision and retain the defined guardrails.'
        : expectedStep?.operatorRationale ??
          (expectedStep
            ? `Complete ${expectedStep.title} and attach fresh objective evidence.`
            : 'Review the failed contract criteria before continuing.');

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
        contractSteps,
        rationaleSummary,
        recommendedNextAction,
      },
      assessedAt,
    };
  }

  private evaluateContractSteps(
    steps: SessionContractStepRecord[],
    completedStepIds: Set<string>,
    evidence: SessionEvidenceRecord[],
    criteria: SessionCriterionAssessment[],
    expectedStep: SessionContractStepRecord | undefined,
    state: SessionState,
    assessedAtMs: number,
  ): ContractStepAssessment[] {
    return steps.map((step) => {
      const linkedCriterion = step.successCriterionKey
        ? criteria.find((criterion) => criterion.criterionKey === step.successCriterionKey)
        : undefined;
      const matchingEvidence = evidence.filter((item) =>
        step.expectedEvidenceKinds?.includes(item.evidenceKind!),
      );
      const relevantEvidence = step.expectedEvidenceKinds?.length
        ? matchingEvidence.filter((item) => item.evidenceKind !== undefined)
        : [];
      const latest = relevantEvidence.at(-1);
      const stale = Boolean(
        latest &&
          (latest.freshnessExpiresAt
            ? timestamp(latest.freshnessExpiresAt, 'evidence.freshnessExpiresAt') < assessedAtMs
            : step.freshnessRequirementSeconds !== undefined &&
              elapsedSeconds(evidenceTimestamp(latest), assessedAtMs) >
                step.freshnessRequirementSeconds),
      );
      const failed =
        linkedCriterion?.status === 'not_met' ||
        (step.expectedEventType === 'qoe.validation.completed' &&
          state === 'failed');
      let status: ContractStepAssessment['status'] = 'pending';
      if (failed) status = 'failed';
      else if (stale) status = 'stale';
      else if (
        completedStepIds.has(step.id) &&
        (!step.expectedEvidenceKinds?.length || relevantEvidence.length > 0) &&
        linkedCriterion?.status !== 'pending'
      ) {
        status = 'satisfied';
      } else if (
        expectedStep?.id === step.id &&
        (state === 'attention_needed' || state === 'intervention_required')
      ) {
        status = 'attention_needed';
      }
      const explanation =
        status === 'satisfied'
          ? 'Required event and evidence are current.'
          : status === 'stale'
            ? 'Evidence exists but no longer meets the freshness requirement.'
            : status === 'failed'
              ? 'The linked contract rule did not pass.'
              : status === 'attention_needed'
                ? step.operatorRationale ?? 'This expected step is overdue.'
                : 'Waiting for the contracted event and evidence.';
      return {
        stepKey: step.stepKey,
        title: step.title,
        status,
        evidenceIds: relevantEvidence.map((item) => item.id),
        explanation,
      };
    });
  }

  private rationaleSummary(
    state: SessionState,
    expectedStep: SessionContractStepRecord | undefined,
    facts: ObjectiveEvidenceFacts,
  ): string {
    if (state === 'completed') {
      return 'The full evidence chain is current and every contracted success rule passed.';
    }
    if (state === 'recovered') {
      return 'Fresh objective evidence restored progress after a previously overdue step.';
    }
    if (state === 'intervention_required') {
      return `Infrastructure activity continued, but ${expectedStep?.title ?? 'the required objective step'} did not advance.`;
    }
    if (state === 'attention_needed') {
      return `${expectedStep?.title ?? 'The next contract step'} is at risk and requires fresh evidence.`;
    }
    if (state === 'failed') {
      return 'Objective evidence is present, but one or more contracted guardrails failed.';
    }
    return facts.baseline.length
      ? `The session is progressing toward ${expectedStep?.title ?? 'contract completion'}.`
      : 'The session is waiting for its first contracted objective evidence.';
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
    facts: ObjectiveEvidenceFacts,
  ): SessionCriterionAssessment[] {
    return criteria.map((criterion) => {
      let observed = observedMetric(criterion, evidence);
      if (criterion.criterionKey === 'qoe_improvement' && facts.baseline.length > 0 && facts.postChange.length > 0) {
        observed = { value: facts.qoeDeltaPct };
      } else if (criterion.criterionKey === 'packet_loss_guardrail' && facts.postChange.length > 0) {
        observed = { value: facts.maxPacketLossPct };
      } else if (criterion.criterionKey === 'bandwidth_tier_coverage' && facts.postChange.length > 0) {
        observed = { value: facts.bandwidthTierCount };
      } else if (criterion.criterionKey === 'recommendation_justified') {
        observed = facts.recommendation ? { value: facts.recommendationJustified ? 1 : 0 } : {};
      }
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
    facts: ObjectiveEvidenceFacts;
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
      signals.push({
        code: 'objective_evidence_stale',
        severity: input.overdue ? 'critical' : 'warning',
        message: `Objective evidence is ${input.evidenceAgeSeconds} seconds old`,
        evidenceIds: input.latestEvidence ? [input.latestEvidence.id] : undefined,
      });
    } else if (input.latestEvidence) {
      signals.push({
        code: 'objective_evidence_fresh',
        severity: 'info',
        message: 'Objective evidence is current',
        evidenceIds: [input.latestEvidence.id],
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

    if (input.facts.baseline.length > 0) {
      signals.push({
        code: 'baseline_present',
        severity: 'info',
        message: 'Baseline QoE evidence is available',
        evidenceIds: input.facts.baseline.map((item) => item.id),
      });
    }
    if (
      input.expectedStep?.expectedEventType === 'qoe.validation.completed' &&
      input.facts.postChange.length === 0
    ) {
      signals.push({
        code: 'post_change_validation_missing',
        severity: input.overdue ? 'critical' : 'warning',
        message: 'Healthy infrastructure has not been followed by post-change QoE validation',
      });
    }
    if (input.facts.postChange.length > 0 && !input.facts.comparison) {
      signals.push({
        code: 'comparison_missing',
        severity: 'warning',
        message: 'Post-change QoE exists, but no baseline comparison is available',
      });
    }
    const packetLoss = input.criterionAssessments.find(
      (criterion) => criterion.criterionKey === 'packet_loss_guardrail',
    );
    if (packetLoss?.status === 'not_met') {
      signals.push({
        code: 'packet_loss_threshold_exceeded',
        severity: 'critical',
        message: 'Post-change packet loss exceeds the contract guardrail',
      });
    }
    const tierCoverage = input.criterionAssessments.find(
      (criterion) => criterion.criterionKey === 'bandwidth_tier_coverage',
    );
    if (tierCoverage && tierCoverage.status !== 'met') {
      signals.push({
        code: 'all_bandwidth_tiers_not_covered',
        severity: 'warning',
        message: 'Validation does not yet cover every required bandwidth tier',
      });
    }
    const improvement = input.criterionAssessments.find(
      (criterion) => criterion.criterionKey === 'qoe_improvement',
    );
    if (improvement?.status === 'met') {
      signals.push({
        code: 'qoe_improved',
        severity: 'info',
        message: 'Post-change QoE is better than the baseline',
      });
    }
    if (input.facts.recommendation && !input.facts.recommendationJustified) {
      signals.push({
        code: 'recommendation_not_justified',
        severity: 'critical',
        message: 'The recommendation is missing baseline, rerun, or comparison evidence',
        evidenceIds: [input.facts.recommendation.id],
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
