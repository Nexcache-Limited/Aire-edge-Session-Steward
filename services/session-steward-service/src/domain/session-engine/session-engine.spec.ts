import type {
  SessionContractRecord,
  SessionContractStepRecord,
  SessionEventRecord,
  SessionEvidenceRecord,
  SessionRecord,
  SessionSuccessCriterionRecord,
} from './session-types';

import { SessionEngine, SessionEngineInput } from './session-engine';

const START = Date.parse('2026-07-21T09:00:00.000Z');
const iso = (minutes: number) => new Date(START + minutes * 60_000).toISOString();

const session: SessionRecord = {
  id: 'session-edge-qoe-042',
  tenantId: 'tenant-nexcache',
  environmentId: 'environment-lhr-edge',
  objective: 'Validate whether edge-route-v18 improves QoE without increasing packet loss',
  workflowType: 'edge_rollout_qoe_validation',
  status: 'active',
  activeContractId: 'contract-edge-qoe-v1',
  createdAt: iso(0),
  updatedAt: iso(0),
};

const contract: SessionContractRecord = {
  id: 'contract-edge-qoe-v1',
  sessionId: session.id,
  version: 1,
  name: 'Edge rollout and QoE validation',
  createdAt: iso(0),
};

const step = (
  stepOrder: number,
  stepKey: string,
  title: string,
  expectedEventType: string,
  maxWaitSeconds: number,
  successRule: Record<string, unknown> = {},
): SessionContractStepRecord => ({
  id: `step-${stepKey}`,
  contractId: contract.id,
  stepOrder,
  stepKey,
  title,
  expectedEventType,
  maxWaitSeconds,
  required: true,
  successRule,
  createdAt: iso(0),
});

const steps: SessionContractStepRecord[] = [
  step(0, 'baseline_qoe', 'Baseline QoE test', 'validation.completed', 300, {
    phase: 'baseline',
  }),
  step(1, 'deploy_routing', 'Deploy routing config', 'deployment.completed', 600),
  step(2, 'health_checks', 'Health checks', 'health.check.passed', 300),
  step(3, 'qoe_validation', 'QoE validation rerun', 'validation.completed', 600, {
    phase: 'post_change',
  }),
  step(4, 'baseline_comparison', 'Baseline comparison', 'comparison.generated', 300),
  step(5, 'recommendation', 'Recommendation', 'recommendation.issued', 300),
];

const criteria: SessionSuccessCriterionRecord[] = [
  {
    id: 'criterion-qoe-improvement',
    contractId: contract.id,
    criterionKey: 'qoe_improvement',
    metricName: 'qoe_improvement_pct',
    operator: '>=',
    thresholdValue: 8,
    unit: '%',
    createdAt: iso(0),
  },
  {
    id: 'criterion-packet-loss',
    contractId: contract.id,
    criterionKey: 'packet_loss_guardrail',
    metricName: 'packet_loss_pct',
    operator: '<=',
    thresholdValue: 1.2,
    unit: '%',
    createdAt: iso(0),
  },
  {
    id: 'criterion-tier-coverage',
    contractId: contract.id,
    criterionKey: 'bandwidth_tier_coverage',
    metricName: 'bandwidth_tiers',
    operator: '>=',
    thresholdValue: 3,
    unit: 'tiers',
    createdAt: iso(0),
  },
];

function event(
  id: string,
  minutes: number,
  normalizedEventType: string,
  payload: Record<string, unknown> = {},
): SessionEventRecord {
  let sourceService = 'evidence-service';
  if (normalizedEventType.startsWith('deployment')) {
    sourceService = 'deployment-service';
  } else if (normalizedEventType.startsWith('health')) {
    sourceService = 'telemetry-service';
  } else if (normalizedEventType.startsWith('validation')) {
    sourceService = 'qoe-service';
  }

  return {
    id,
    sessionId: session.id,
    tenantId: session.tenantId,
    sourceService,
    sourceEventType: normalizedEventType,
    normalizedEventType,
    sourceRef: `${id}-source`,
    workflowId: 'rollout-edge-route-v18',
    occurredAt: iso(minutes),
    payload,
    ingestedAt: iso(minutes),
  };
}

function evidence(
  id: string,
  minutes: number,
  value: Record<string, unknown>,
  freshnessMinutes = 15,
): SessionEvidenceRecord {
  return {
    id,
    sessionId: session.id,
    evidenceType: 'qoe.validation.result',
    sourceEventId: `${id}-event`,
    freshnessExpiresAt: iso(minutes + freshnessMinutes),
    value,
    createdAt: iso(minutes),
  };
}

const baselineEvent = event('evt-baseline', 0, 'validation.completed', {
  phase: 'baseline',
  qoeScore: 71.4,
  packetLossPct: 0.8,
});
const deploymentEvent = event('evt-deployment', 5, 'deployment.completed', {
  configVersion: 'edge-route-v18',
  completedNodes: 12,
  targetNodes: 12,
});
const healthEvent = event('evt-health', 7, 'health.check.passed', {
  probesPassed: 24,
  probesTotal: 24,
});

function input(overrides: Partial<SessionEngineInput>): SessionEngineInput {
  return {
    session,
    contract,
    steps,
    successCriteria: criteria,
    events: [],
    evidence: [],
    ...overrides,
  };
}

describe('SessionEngine - edge rollout and QoE validation', () => {
  const engine = new SessionEngine();

  it('completes the happy path when every required step and success criterion passes', () => {
    const assessment = engine.assess(
      input({
        events: [
          baselineEvent,
          deploymentEvent,
          healthEvent,
          event('evt-validation-started', 10, 'validation.started', { phase: 'post_change' }),
          event('evt-validation-completed', 12, 'validation.completed', {
            phase: 'post_change',
          }),
          event('evt-comparison', 14, 'comparison.generated'),
          event('evt-recommendation', 15, 'recommendation.issued'),
        ],
        evidence: [
          evidence('evidence-post-change', 12, {
            qoe_improvement_pct: 10.9,
            packet_loss_pct: 0.9,
            bandwidth_tiers: 3,
          }),
        ],
        assessedAt: iso(16),
      }),
    );

    expect(assessment.state).toBe('completed');
    expect(assessment.completionPercent).toBe(100);
    expect(assessment.expectedStepKey).toBeUndefined();
    expect(assessment.confidence).toBeGreaterThanOrEqual(95);
    expect(assessment.rationale.successCriteria).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ criterionKey: 'qoe_improvement', status: 'met' }),
        expect.objectContaining({ criterionKey: 'packet_loss_guardrail', status: 'met' }),
        expect.objectContaining({ criterionKey: 'bandwidth_tier_coverage', status: 'met' }),
      ]),
    );
  });

  it('moves from legitimate wait to intervention when healthy deployment polling adds no QoE evidence', () => {
    const baselineEvidence = evidence(
      'evidence-baseline',
      0,
      { qoe_score: 71.4, packet_loss_pct: 0.8, bandwidth_tiers: 3 },
      5,
    );
    const insideWindow = engine.assess(
      input({
        events: [
          baselineEvent,
          deploymentEvent,
          healthEvent,
          event('evt-poll-1', 12, 'deployment.polled', { status: 'healthy' }),
        ],
        evidence: [baselineEvidence],
        assessedAt: iso(13),
      }),
    );
    const overdue = engine.assess(
      input({
        events: [
          baselineEvent,
          deploymentEvent,
          healthEvent,
          event('evt-poll-1', 12, 'deployment.polled', { status: 'healthy' }),
          event('evt-poll-2', 20, 'deployment.polled', { status: 'healthy' }),
        ],
        evidence: [baselineEvidence],
        assessedAt: iso(21),
      }),
    );

    expect(insideWindow.state).toBe('legitimate_wait');
    expect(insideWindow.expectedStepKey).toBe('qoe_validation');
    expect(overdue.state).toBe('intervention_required');
    expect(overdue.completionPercent).toBe(50);
    expect(overdue.confidence).toBeLessThan(insideWindow.confidence);
    expect(overdue.rationale.repeatedNonProgressCount).toBe(2);
    expect(overdue.rationale.signals.map((signal) => signal.code)).toEqual(
      expect.arrayContaining([
        'repeated_non_progress',
        'validation_overdue',
        'missing_follow_through',
      ]),
    );
  });

  it('recovers when overdue QoE validation and comparison evidence arrive', () => {
    const assessment = engine.assess(
      input({
        events: [
          baselineEvent,
          deploymentEvent,
          healthEvent,
          event('evt-poll-1', 12, 'deployment.polled', { status: 'healthy' }),
          event('evt-poll-2', 20, 'deployment.polled', { status: 'healthy' }),
          event('evt-validation-completed', 24, 'validation.completed', {
            phase: 'post_change',
          }),
          event('evt-comparison', 25, 'comparison.generated'),
        ],
        evidence: [
          evidence('evidence-recovered', 24, {
            qoe_improvement_pct: 10.9,
            packet_loss_pct: 0.9,
            bandwidth_tiers: 3,
          }),
        ],
        assessedAt: iso(25.5),
      }),
    );

    expect(assessment.state).toBe('recovered');
    expect(assessment.completionPercent).toBe(83);
    expect(assessment.expectedStepKey).toBe('recommendation');
    expect(assessment.confidence).toBeGreaterThanOrEqual(82);
    expect(assessment.rationale.signals).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'recovery_detected' })]),
    );
  });

  it('flags QoE evidence captured before the routing change as stale', () => {
    const assessment = engine.assess(
      input({
        events: [baselineEvent, deploymentEvent, healthEvent],
        evidence: [
          evidence(
            'evidence-pre-change',
            0,
            { qoe_score: 71.4, packet_loss_pct: 0.8, bandwidth_tiers: 3 },
            4,
          ),
        ],
        assessedAt: iso(20),
      }),
    );

    expect(assessment.rationale.staleEvidenceAgeSeconds).toBe(20 * 60);
    expect(assessment.confidence).toBeLessThan(80);
    expect(assessment.rationale.signals).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'evidence_stale' })]),
    );
  });
});

describe('SessionEngine - AIRE-Edge training workflow', () => {
  const engine = new SessionEngine();
  const trainingSession: SessionRecord = {
    ...session,
    id: 'training-session-042',
    objective: 'Train and validate a converged routing policy',
    workflowType: 'model_training',
    workflowId: 'mlflow-run-42',
    activeContractId: 'training-contract-v1',
  };
  const trainingContract: SessionContractRecord = {
    ...contract,
    id: 'training-contract-v1',
    sessionId: trainingSession.id,
    name: 'AIRE-Edge training run',
  };
  const trainingSteps = [
    ['training-started', 'Start training', 'training.started', 'training_context'],
    [
      'checkpoint-produced',
      'Produce a checkpoint',
      'training.checkpoint.produced',
      'training_checkpoint',
    ],
    [
      'validation-recorded',
      'Record validation evidence',
      'training.validation.metric.recorded',
      'training_validation_metric',
    ],
    ['training-completed', 'Complete training', 'training.completed', 'training_completion'],
  ].map(([key, title, expectedEventType, evidenceKind], index): SessionContractStepRecord => ({
    id: `step-${key}`,
    contractId: trainingContract.id,
    stepOrder: index,
    stepKey: key,
    title,
    expectedEventType,
    expectedEvidenceKinds: [evidenceKind as NonNullable<SessionEvidenceRecord['evidenceKind']>],
    successCriterionKey:
      expectedEventType === 'training.completed' ? 'training-converged' : undefined,
    maxWaitSeconds: 1800,
    required: true,
    successRule: {},
    createdAt: iso(0),
  }));
  const trainingCriteria: SessionSuccessCriterionRecord[] = [
    {
      id: 'criterion-training-confidence',
      contractId: trainingContract.id,
      criterionKey: 'training-confidence',
      metricName: 'training_confidence_margin',
      operator: '>=',
      thresholdValue: 0,
      createdAt: iso(0),
    },
    {
      id: 'criterion-training-converged',
      contractId: trainingContract.id,
      criterionKey: 'training-converged',
      metricName: 'training_converged',
      operator: '>=',
      thresholdValue: 1,
      createdAt: iso(0),
    },
  ];
  const trainingEvent = (
    id: string,
    minutes: number,
    normalizedEventType: string,
  ): SessionEventRecord => ({
    ...event(id, minutes, normalizedEventType),
    sessionId: trainingSession.id,
    sourceService: 'ai-orchestration-service',
    workflowId: trainingSession.workflowId,
  });
  const trainingEvidence = (
    id: string,
    minutes: number,
    evidenceKind: SessionEvidenceRecord['evidenceKind'],
    metricSet: SessionEvidenceRecord['metricSet'] = {},
  ): SessionEvidenceRecord => ({
    id,
    sessionId: trainingSession.id,
    evidenceType: `objective.${evidenceKind}`,
    evidenceKind,
    sourceService: 'ai-orchestration-service',
    sourceEventId: `${id}-event`,
    metricSet,
    recordedAt: iso(minutes),
    value: {},
    createdAt: iso(minutes),
  });

  it('completes when checkpoint, validation, convergence, and artifact evidence arrive', () => {
    const assessment = engine.assess({
      session: trainingSession,
      contract: trainingContract,
      steps: trainingSteps,
      successCriteria: trainingCriteria,
      events: [
        trainingEvent('training-start', 0, 'training.started'),
        trainingEvent('training-checkpoint', 5, 'training.checkpoint.produced'),
        trainingEvent('training-validation', 8, 'training.validation.metric.recorded'),
        trainingEvent('training-complete', 10, 'training.completed'),
      ],
      evidence: [
        trainingEvidence('evidence-start', 0, 'training_context'),
        trainingEvidence('evidence-checkpoint', 5, 'training_checkpoint', {
          checkpointStep: 50000,
          progressPct: 50,
        }),
        trainingEvidence('evidence-validation', 8, 'training_validation_metric', {
          confidenceMargin: 0.11,
          convergencePassed: 1,
        }),
        trainingEvidence('evidence-completion', 10, 'training_completion', {
          confidenceMargin: 0.11,
          convergencePassed: 1,
          meanReward: 18.3,
        }),
      ],
      assessedAt: iso(10.5),
    });

    expect(assessment).toMatchObject({
      state: 'completed',
      completionPercent: 100,
      confidence: 96,
    });
    expect(assessment.rationale.rationaleSummary).toContain('Training completed');
    expect(assessment.rationale.recommendedNextAction).toContain('Accept the completed');
    expect(assessment.rationale.successCriteria?.every((item) => item.status === 'met')).toBe(
      true,
    );
  });

  it('treats TrainingFailed as a terminal deterministic failure', () => {
    const assessment = engine.assess({
      session: trainingSession,
      contract: trainingContract,
      steps: trainingSteps,
      successCriteria: trainingCriteria,
      events: [
        trainingEvent('training-start', 0, 'training.started'),
        trainingEvent('training-failed', 2, 'training.failed'),
      ],
      evidence: [
        trainingEvidence('evidence-start', 0, 'training_context'),
        trainingEvidence('evidence-failure', 2, 'training_failure'),
      ],
      assessedAt: iso(2.5),
    });

    expect(assessment.state).toBe('failed');
    expect(assessment.confidence).toBeLessThanOrEqual(15);
    expect(assessment.rationale.signals).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'training_failed' })]),
    );
    expect(assessment.rationale.recommendedNextAction).toContain('new training session');
    expect(
      assessment.rationale.contractSteps?.find(
        (item) => item.stepKey === 'checkpoint-produced',
      )?.status,
    ).toBe('failed');
  });
});
