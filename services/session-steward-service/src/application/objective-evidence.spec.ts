import type { DeepPartial, FindManyOptions, FindOneOptions, Repository } from 'typeorm';

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
import { DeploymentEventNormalizer } from '../infrastructure/ingest/deployment-event.normalizer';
import { EvidenceEventNormalizer } from '../infrastructure/ingest/evidence-event.normalizer';
import { QoeEventNormalizer } from '../infrastructure/ingest/qoe-event.normalizer';
import { TelemetryEventNormalizer } from '../infrastructure/ingest/telemetry-event.normalizer';
import { TrainingEventNormalizer } from '../infrastructure/ingest/training-event.normalizer';
import { SessionAssessmentService } from './session-assessment.service';
import { SessionCorrelationService } from './session-correlation.service';
import { SessionEvaluationService } from './session-evaluation.service';
import { SessionEvidenceMapperService } from './session-evidence-mapper.service';
import { SessionEventsService } from './session-events.service';
import { SessionsQueryService } from './sessions-query.service';

const START = Date.parse('2026-07-21T09:00:00.000Z');
const iso = (minutes: number) => new Date(START + minutes * 60_000).toISOString();
let nextId = 1;
const uuid = () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;
type EntityShape = { id?: string };

function matches<T extends EntityShape>(entity: T, where?: object): boolean {
  return !where || Object.entries(where).every(([key, value]) => entity[key as keyof T] === value);
}

function sorted<T extends EntityShape>(rows: T[], order?: Record<string, unknown>): T[] {
  const [key, direction] = Object.entries(order ?? {})[0] ?? [];
  if (!key) return rows;
  const multiplier = direction === 'DESC' ? -1 : 1;
  return [...rows].sort((left, right) => {
    const leftValue = left[key as keyof T];
    const rightValue = right[key as keyof T];
    const a = leftValue instanceof Date ? leftValue.getTime() : String(leftValue);
    const b = rightValue instanceof Date ? rightValue.getTime() : String(rightValue);
    return a < b ? -multiplier : a > b ? multiplier : 0;
  });
}

function memoryRepository<T extends EntityShape>(
  initial: T[] = [],
  prepare: (value: T) => T = (value) => value,
): { repository: Repository<T>; rows: T[] } {
  const rows = [...initial];
  const repository = {
    create: (input: DeepPartial<T>) => input as T,
    save: (input: T) => {
      const value = prepare({ ...input, id: input.id ?? uuid() });
      const index = rows.findIndex((row) => row.id === value.id);
      if (index >= 0) rows[index] = value;
      else rows.push(value);
      return Promise.resolve(value);
    },
    findOne: (options: FindOneOptions<T>) =>
      Promise.resolve(
        sorted(
          rows.filter((row) => matches(row, options.where as object | undefined)),
          options.order as Record<string, unknown> | undefined,
        )[0] ?? null,
      ),
    find: (options: FindManyOptions<T> = {}) => {
      const result = sorted(
        rows.filter((row) => matches(row, options.where as object | undefined)),
        options.order as Record<string, unknown> | undefined,
      );
      return Promise.resolve(options.take ? result.slice(0, options.take) : result);
    },
  };
  return { repository: repository as unknown as Repository<T>, rows };
}

const TENANT = '10000000-0000-4000-8000-000000000001';
const ENVIRONMENT = '20000000-0000-4000-8000-000000000001';
const SESSION = '30000000-0000-4000-8000-000000000001';
const CONTRACT = '40000000-0000-4000-8000-000000000001';
const WORKFLOW = 'rollout-edge-v18';

function createHarness() {
  nextId = 1;
  const session = memoryRepository<SessionEntity>([{
    id: SESSION,
    tenantId: TENANT,
    environmentId: ENVIRONMENT,
    objective: 'Improve QoE without exceeding the packet-loss guardrail',
    workflowType: 'edge_rollout_qoe_validation',
    workflowId: WORKFLOW,
    status: 'active',
    activeContractId: CONTRACT,
    createdAt: new Date(iso(0)),
    updatedAt: new Date(iso(0)),
  }]);
  const contracts = memoryRepository<SessionContractEntity>([{
    id: CONTRACT,
    sessionId: SESSION,
    version: 1,
    name: 'Evidence-backed edge rollout',
    createdAt: new Date(iso(0)),
  }]);
  const step = (order: number, key: string, eventType: string, wait = 600): SessionContractStepEntity => ({
    id: uuid(), contractId: CONTRACT, stepOrder: order, stepKey: key, title: key,
    expectedEventType: eventType, maxWaitSeconds: wait, required: true, successRule: {},
    createdAt: new Date(iso(0)),
  });
  const steps = memoryRepository<SessionContractStepEntity>([
    step(0, 'baseline', 'qoe.baseline.completed', 300),
    step(1, 'deployment', 'deployment.completed'),
    step(2, 'health', 'health.check.passed', 300),
    step(3, 'validation', 'qoe.validation.completed'),
    step(4, 'comparison', 'qoe.comparison.generated', 300),
    step(5, 'recommendation', 'qoe.recommendation.generated', 300),
  ]);
  const criterion = (
    key: string, metricName: string, operator: '>=' | '<=', thresholdValue: number,
  ): SessionSuccessCriterionEntity => ({
    id: uuid(), contractId: CONTRACT, criterionKey: key, metricName, operator,
    thresholdValue, unit: null, createdAt: new Date(iso(0)),
  });
  const criteria = memoryRepository<SessionSuccessCriterionEntity>([
    criterion('qoe_improvement', 'qoe_improvement_pct', '>=', 0.01),
    criterion('packet_loss_guardrail', 'packet_loss_pct', '<=', 1.2),
    criterion('bandwidth_tier_coverage', 'bandwidth_tiers', '>=', 3),
    criterion('recommendation_justified', 'recommendation_justified', '>=', 1),
  ]);
  const eventStore = memoryRepository<SessionEventEntity>([], (event) => ({
    ...event, ingestedAt: event.ingestedAt ?? event.occurredAt,
  }));
  const evidence = memoryRepository<SessionEvidenceEntity>([], (item) => ({
    ...item, createdAt: item.createdAt ?? item.recordedAt,
  }));
  const assessments = memoryRepository<SessionAssessmentEntity>();
  const interventions = memoryRepository<SessionInterventionEntity>([], (item) => ({
    ...item, createdAt: item.createdAt ?? new Date(iso(0)),
  }));
  const evaluation = new SessionEvaluationService(
    session.repository, contracts.repository, steps.repository, criteria.repository,
    eventStore.repository, evidence.repository, assessments.repository,
    interventions.repository, new SessionAssessmentService(),
  );
  const events = new SessionEventsService(
    eventStore.repository,
    new SessionCorrelationService(session.repository),
    new SessionEvidenceMapperService(evidence.repository),
    evaluation,
  );
  const queries = new SessionsQueryService(
    session.repository, contracts.repository, steps.repository, eventStore.repository,
    assessments.repository, evidence.repository,
  );
  return {
    events, queries, evidenceRows: evidence.rows, assessmentRows: assessments.rows,
    qoe: new QoeEventNormalizer(), deployment: new DeploymentEventNormalizer(),
    telemetry: new TelemetryEventNormalizer(), evidence: new EvidenceEventNormalizer(),
    training: new TrainingEventNormalizer(),
  };
}

const common = (id: string, type: string, minutes: number, payload: Record<string, unknown>) => ({
  event_id: id, event_type: type, tenant_id: TENANT, environment_id: ENVIRONMENT,
  workflow_id: WORKFLOW, occurred_at: iso(minutes), payload,
});

async function ingestInfrastructure(harness: ReturnType<typeof createHarness>) {
  await harness.events.ingest(harness.deployment.normalize(common('deploy', 'deployment.completed', 2, {})));
  await harness.events.ingest(harness.telemetry.normalize({
    ...common('health', 'health.passed', 3, { health_status: 'healthy' }),
    recorded_at: iso(3),
  }));
}

async function ingestHappyEvidence(
  harness: ReturnType<typeof createHarness>,
  packetLossPct = 0.9,
  delta = 12.5,
) {
  await harness.events.ingest(harness.qoe.normalize(common('baseline', 'qoe.baseline.completed', 1, {
    metric_set: { qoe_score: 4, packet_loss_pct: 0.8, bandwidth_tier: 'low' },
  })));
  await ingestInfrastructure(harness);
  for (const [index, tier] of ['low', 'medium', 'high'].entries()) {
    await harness.events.ingest(harness.qoe.normalize(common(`validation-${tier}`, 'qoe.validation.completed', 4 + index, {
      metrics: { qoe_score: 4.5, packet_loss_pct: packetLossPct, bandwidth_tier: tier },
    })));
  }
  await harness.events.ingest(harness.qoe.normalize(common('comparison', 'qoe.comparison.generated', 8, {
    comparison_delta_pct: delta,
  })));
  await harness.events.ingest(harness.qoe.normalize(common('recommendation', 'qoe.recommendation.generated', 9, {
    recommendation: 'promote', cohort_pct: 100,
  })));
}

describe('Sprint 3 objective evidence pipeline', () => {
  it('normalizes a real QoEScoreEvent envelope into persisted objective evidence', async () => {
    const harness = createHarness();
    const qoeScoreEvent = (
      eventId: string,
      phase: 'baseline' | 'post_change',
      minutes: number,
      qoeScore: number,
      packetLossPct: number,
    ) => ({
      eventId,
      eventType: 'QoEScoreEvent',
      tenantId: TENANT,
      environmentId: ENVIRONMENT,
      workflowId: WORKFLOW,
      recordedAt: iso(minutes),
      payload: {
        phase,
        metrics: {
          qoeScore,
          packetLossPct,
          bandwidthTier: 'low',
        },
      },
    });

    await harness.events.ingest(
      harness.qoe.normalize(qoeScoreEvent('score-baseline', 'baseline', 1, 71.4, 0.8)),
    );
    await ingestInfrastructure(harness);
    await harness.events.ingest(
      harness.qoe.normalize(qoeScoreEvent('score-rerun', 'post_change', 4, 79.2, 0.9)),
    );

    const baseline = harness.evidenceRows.find((item) => item.evidenceKind === 'baseline_qoe');
    const postChange = harness.evidenceRows.find(
      (item) => item.evidenceKind === 'post_change_qoe',
    );
    expect(baseline?.metricSet).toMatchObject({ qoeScore: 71.4, packetLossPct: 0.8 });
    expect(postChange?.metricSet).toMatchObject({ qoeScore: 79.2, packetLossPct: 0.9 });
    expect(harness.assessmentRows.at(-1)?.state).toBe('progressing');
  });

  it('completes with high confidence when the full QoE evidence chain passes', async () => {
    const harness = createHarness();
    await ingestHappyEvidence(harness);
    const latest = harness.assessmentRows.at(-1);
    const detail = await harness.queries.detail(TENANT, SESSION);
    expect(latest).toMatchObject({ state: 'completed', completionPercent: 100 });
    expect(Number(latest?.confidence)).toBeGreaterThanOrEqual(95);
    expect(latest?.rationale.successCriteria?.every((item) => item.status === 'met')).toBe(true);
    expect(latest?.rationale.contractSteps?.every((item) => item.status === 'satisfied')).toBe(true);
    expect(latest?.rationale.rationaleSummary).toContain('full evidence chain');
    expect(latest?.rationale.recommendedNextAction).toContain('promotion');
    expect(detail.evidenceSummary).toMatchObject({
      baselinePresent: true, postChangeValidationPresent: true,
      comparisonPresent: true, recommendationPresent: true,
      latestQoeScore: 4.5, latestPacketLossPct: 0.9, comparisonDeltaPct: 12.5,
    });
  });

  it('intervenes when healthy infrastructure is not followed by a QoE rerun', async () => {
    const harness = createHarness();
    await harness.events.ingest(harness.qoe.normalize(common('baseline', 'qoe.baseline.completed', 1, {
      qoe_score: 4,
    })));
    await ingestInfrastructure(harness);
    for (const minute of [14, 20]) {
      await harness.events.ingest(harness.deployment.normalize(common(`poll-${minute}`, 'deployment.polled', minute, {})));
    }
    const latest = harness.assessmentRows.at(-1)!;
    expect(latest.state).toBe('intervention_required');
    expect(latest.rationale.signals.map((signal) => signal.code)).toContain('post_change_validation_missing');
    expect(latest.rationale.contractSteps?.find((step) => step.stepKey === 'validation')?.status).toBe(
      'attention_needed',
    );
  });

  it('fails deterministically when QoE regresses or packet loss exceeds its guardrail', async () => {
    const harness = createHarness();
    await ingestHappyEvidence(harness, 1.8, -4);
    const latest = harness.assessmentRows.at(-1)!;
    expect(latest.state).toBe('failed');
    expect(latest.rationale.successCriteria).toEqual(expect.arrayContaining([
      expect.objectContaining({ criterionKey: 'qoe_improvement', status: 'not_met' }),
      expect.objectContaining({ criterionKey: 'packet_loss_guardrail', status: 'not_met' }),
    ]));
    expect(latest.rationale.signals.map((signal) => signal.code)).toContain('packet_loss_threshold_exceeded');
  });

  it('does not justify a recommendation without baseline, rerun, and comparison evidence', async () => {
    const harness = createHarness();
    await harness.events.ingest(harness.qoe.normalize(common('recommendation', 'qoe.recommendation.generated', 1, {
      recommendation: 'promote',
    })));
    const latest = harness.assessmentRows.at(-1)!;
    expect(latest.state).not.toBe('completed');
    expect(latest.rationale.signals.map((signal) => signal.code)).toContain('recommendation_not_justified');
  });

  it('links evidence artifacts, citations, and notes to the session read model', async () => {
    const harness = createHarness();
    const records = [
      common('artifact', 'evidence.recorded', 1, { artifact: { artifact_type: 'json', uri: 's3://evidence/run.json', title: 'QoE run' } }),
      common('citation', 'evidence.citation.linked', 2, { artifact: { citation_key: 'qoe-run-1', uri: 's3://evidence/run.json' } }),
      common('note', 'evidence.note.attached', 3, { title: 'Experiment note', note: 'London edge cohort' }),
    ];
    for (const record of records) {
      await harness.events.ingest(harness.evidence.normalize(record));
    }
    const result = await harness.queries.evidenceList(TENANT, SESSION);
    expect(result.records.map((record) => record.kind)).toEqual(['artifact', 'citation', 'note']);
    expect(result.records[0].artifact).toMatchObject({ uri: 's3://evidence/run.json' });
    expect(harness.evidenceRows).toHaveLength(3);
  });

  it('persists the AIRE-Edge training lifecycle as structured session evidence', async () => {
    const harness = createHarness();
    const trainingEvent = (
      id: string,
      eventType: string,
      minutes: number,
      payload: Record<string, unknown>,
    ) => ({
      event_id: id,
      timestamp: iso(minutes),
      tenant_id: TENANT,
      training_session_id: SESSION,
      run_id: 'mlflow-run-42',
      environment: 'stg',
      provider: 'vast',
      event_type: eventType,
      version: 'v1',
      deployment_id: null,
      payload,
    });

    await harness.events.ingest(
      harness.training.normalize(
        trainingEvent('training-start', 'TrainingStarted', 1, {
          profile: 'standard',
          algorithm: 'PPO',
          total_timesteps: 100000,
          baseline_reward: 12.5,
        }),
      ),
    );
    await harness.events.ingest(
      harness.training.normalize(
        trainingEvent('training-checkpoint', 'CheckpointProduced', 2, {
          checkpoint_step: 50000,
          checkpoint_path: 's3://models/run-42/checkpoint.zip',
          total_timesteps: 100000,
          progress_pct: 50,
        }),
      ),
    );
    await harness.events.ingest(
      harness.training.normalize(
        trainingEvent('training-validation', 'ValidationMetricRecorded', 3, {
          metric_name: 'mean_reward',
          metric_value: 18.3,
          step: 50000,
          baseline_reward: 12.5,
          confidence_score: 0.91,
          confidence_gate: 0.8,
          converged: true,
        }),
      ),
    );
    await harness.events.ingest(
      harness.training.normalize(
        trainingEvent('training-complete', 'TrainingCompleted', 4, {
          total_timesteps: 100000,
          mean_reward: 18.3,
          baseline_reward: 12.5,
          confidence_score: 0.91,
          confidence_gate: 0.8,
          converged: true,
          artifact_path: 's3://models/run-42/final.zip',
          duration_seconds: 240,
        }),
      ),
    );

    expect(harness.evidenceRows.map((item) => item.evidenceKind)).toEqual([
      'training_context',
      'training_checkpoint',
      'training_validation_metric',
      'training_completion',
    ]);
    expect(
      harness.evidenceRows.find((item) => item.evidenceKind === 'training_checkpoint'),
    ).toMatchObject({
      metricSet: { checkpointStep: 50000, progressPct: 50 },
      artifact: {
        artifactType: 'training_checkpoint',
        uri: 's3://models/run-42/checkpoint.zip',
      },
    });
    expect(
      harness.evidenceRows.find((item) => item.evidenceKind === 'training_completion'),
    ).toMatchObject({
      metricSet: {
        meanReward: 18.3,
        confidenceScore: 0.91,
        confidenceGate: 0.8,
        convergencePassed: 1,
      },
      artifact: {
        artifactType: 'training_model',
        uri: 's3://models/run-42/final.zip',
      },
    });
    expect(
      harness.evidenceRows.find((item) => item.evidenceKind === 'training_completion')
        ?.metricSet?.confidenceMargin,
    ).toBeCloseTo(0.11);
    const detail = await harness.queries.detail(TENANT, SESSION);
    expect(detail.evidenceSummary.training).toMatchObject({
      startedPresent: true,
      checkpointPresent: true,
      validationPresent: true,
      completionPresent: true,
      failurePresent: false,
      checkpointProgressPct: 50,
      meanReward: 18.3,
      confidenceScore: 0.91,
      converged: true,
      artifactUri: 's3://models/run-42/final.zip',
    });
  });

  it('persists TrainingFailed error context as terminal objective evidence', async () => {
    const harness = createHarness();
    await harness.events.ingest(
      harness.training.normalize({
        event_id: '50000000-0000-4000-8000-000000000005',
        timestamp: iso(2),
        tenant_id: TENANT,
        training_session_id: SESSION,
        run_id: null,
        environment: 'stg',
        provider: 'vast',
        event_type: 'TrainingFailed',
        version: 'v1',
        deployment_id: null,
        payload: {
          error_type: 'WorkerLost',
          error_message: 'Vast worker became unavailable',
          failed_at_step: 24000,
          duration_seconds: 120,
        },
      }),
    );

    expect(harness.evidenceRows[0]).toMatchObject({
      evidenceKind: 'training_failure',
      metricSet: { failedAtStep: 24000, durationSeconds: 120 },
      value: {
        error_type: 'WorkerLost',
        error_message: 'Vast worker became unavailable',
      },
    });
    const detail = await harness.queries.detail(TENANT, SESSION);
    expect(detail.evidenceSummary.training).toMatchObject({
      failurePresent: true,
      failureType: 'WorkerLost',
    });
  });
});
