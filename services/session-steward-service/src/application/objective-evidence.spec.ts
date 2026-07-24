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
});
