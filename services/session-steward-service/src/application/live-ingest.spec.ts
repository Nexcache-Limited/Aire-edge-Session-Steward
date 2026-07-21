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
import { TelemetryEventNormalizer } from '../infrastructure/ingest/telemetry-event.normalizer';
import { SessionAssessmentService } from './session-assessment.service';
import { SessionCorrelationService } from './session-correlation.service';
import { SessionEvaluationService } from './session-evaluation.service';
import { SessionEventsService } from './session-events.service';
import { SessionsQueryService } from './sessions-query.service';

const START = Date.parse('2026-07-21T09:00:00.000Z');
const iso = (minutes: number) => new Date(START + minutes * 60_000).toISOString();

let nextId = 1;
const uuid = () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;

type EntityShape = { id?: string };

function matches<T extends EntityShape>(entity: T, where: object | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(
    ([key, value]) => entity[key as keyof T] === value,
  );
}

function sorted<T extends EntityShape>(
  rows: T[],
  order: Record<string, unknown> | undefined,
): T[] {
  if (!order) return rows;
  const entry = Object.entries(order)[0];
  const key = entry?.[0];
  const direction = entry?.[1];
  if (!key) return rows;
  const multiplier = direction === 'DESC' ? -1 : 1;
  return [...rows].sort((left, right) => {
    const leftValue = left[key as keyof T];
    const rightValue = right[key as keyof T];
    const leftComparable = leftValue instanceof Date ? leftValue.getTime() : String(leftValue);
    const rightComparable = rightValue instanceof Date ? rightValue.getTime() : String(rightValue);
    return leftComparable < rightComparable ? -multiplier : leftComparable > rightComparable ? multiplier : 0;
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
      const existing = rows.findIndex((row) => row.id === value.id);
      if (existing >= 0) rows[existing] = value;
      else rows.push(value);
      return Promise.resolve(value);
    },
    findOne: (options: FindOneOptions<T>) => {
      const where = options.where as object | undefined;
      return Promise.resolve(
        sorted(
          rows.filter((row) => matches(row, where)),
          options.order as Record<string, unknown> | undefined,
        )[0] ?? null,
      );
    },
    find: (options: FindManyOptions<T> = {}) => {
      const where = options.where as object | undefined;
      const result = sorted(
        rows.filter((row) => matches(row, where)),
        options.order as Record<string, unknown> | undefined,
      );
      return Promise.resolve(options.take ? result.slice(0, options.take) : result);
    },
  };
  return { repository: repository as unknown as Repository<T>, rows };
}

interface Harness {
  events: SessionEventsService;
  queries: SessionsQueryService;
  deployment: DeploymentEventNormalizer;
  telemetry: TelemetryEventNormalizer;
  eventRows: SessionEventEntity[];
  assessmentRows: SessionAssessmentEntity[];
  interventionRows: SessionInterventionEntity[];
}

function createHarness(): Harness {
  nextId = 1;
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const environmentId = '20000000-0000-4000-8000-000000000001';
  const sessionId = '30000000-0000-4000-8000-000000000001';
  const contractId = '40000000-0000-4000-8000-000000000001';
  const session = memoryRepository<SessionEntity>([
    {
      id: sessionId,
      tenantId,
      environmentId,
      objective: 'Validate edge rollout health before QoE validation',
      workflowType: 'edge_rollout_qoe_validation',
      workflowId: 'rollout-edge-v18',
      status: 'active',
      activeContractId: contractId,
      createdAt: new Date(iso(0)),
      updatedAt: new Date(iso(0)),
    },
  ]);
  const contracts = memoryRepository<SessionContractEntity>([
    {
      id: contractId,
      sessionId,
      version: 1,
      name: 'Live edge rollout validation',
      createdAt: new Date(iso(0)),
    },
  ]);
  const step = (
    stepOrder: number,
    stepKey: string,
    expectedEventType: string,
    maxWaitSeconds: number,
  ): SessionContractStepEntity => ({
    id: uuid(),
    contractId,
    stepOrder,
    stepKey,
    title: stepKey.replaceAll('_', ' '),
    expectedEventType,
    maxWaitSeconds,
    required: true,
    successRule: {},
    createdAt: new Date(iso(0)),
  });
  const steps = memoryRepository<SessionContractStepEntity>([
    step(0, 'deployment_started', 'deployment.started', 300),
    step(1, 'deployment_completed', 'deployment.completed', 600),
    step(2, 'health_checks', 'health.check.passed', 300),
    step(3, 'qoe_validation', 'validation.completed', 600),
  ]);
  const criteria = memoryRepository<SessionSuccessCriterionEntity>();
  const eventStore = memoryRepository<SessionEventEntity>([], (value) => ({
    ...value,
    ingestedAt: value.ingestedAt ?? value.occurredAt,
  }));
  const evidence = memoryRepository<SessionEvidenceEntity>();
  const assessments = memoryRepository<SessionAssessmentEntity>();
  const interventions = memoryRepository<SessionInterventionEntity>([], (value) => ({
    ...value,
    createdAt: value.createdAt ?? new Date(iso(0)),
  }));

  const assessmentService = new SessionAssessmentService();
  const correlation = new SessionCorrelationService(session.repository);
  const evaluation = new SessionEvaluationService(
    session.repository,
    contracts.repository,
    steps.repository,
    criteria.repository,
    eventStore.repository,
    evidence.repository,
    assessments.repository,
    interventions.repository,
    assessmentService,
  );
  const events = new SessionEventsService(eventStore.repository, correlation, evaluation);
  const queries = new SessionsQueryService(
    session.repository,
    contracts.repository,
    steps.repository,
    eventStore.repository,
    assessments.repository,
  );

  return {
    events,
    queries,
    deployment: new DeploymentEventNormalizer(),
    telemetry: new TelemetryEventNormalizer(),
    eventRows: eventStore.rows,
    assessmentRows: assessments.rows,
    interventionRows: interventions.rows,
  };
}

const deploymentEvent = (
  eventId: string,
  eventType: string,
  minutes: number,
  payload: Record<string, unknown>,
) => ({
  event_id: eventId,
  event_type: eventType,
  tenant_id: '10000000-0000-4000-8000-000000000001',
  environment_id: '20000000-0000-4000-8000-000000000001',
  rollout_id: 'rollout-edge-v18',
  occurred_at: iso(minutes),
  payload,
});

const telemetryEvent = (
  eventId: string,
  eventType: string,
  minutes: number,
  payload: Record<string, unknown>,
) => ({
  event_id: eventId,
  event_type: eventType,
  tenant_id: '10000000-0000-4000-8000-000000000001',
  environment_id: '20000000-0000-4000-8000-000000000001',
  workflow_id: 'rollout-edge-v18',
  recorded_at: iso(minutes),
  payload,
});

describe('live ingest to assessment pipeline', () => {
  it('correlates a healthy rollout, builds its timeline, and leaves validation in wait', async () => {
    const harness = createHarness();
    await harness.events.ingest(
      harness.deployment.normalize(
        deploymentEvent('deploy-1', 'rollout.started', 0, { rolloutStatus: 'running' }),
      ),
    );
    await harness.events.ingest(
      harness.deployment.normalize(
        deploymentEvent('deploy-2', 'rollout.completed', 1, {
          rollout_status: 'completed',
          completed_nodes: 12,
          target_nodes: 12,
        }),
      ),
    );
    await harness.events.ingest(
      harness.telemetry.normalize(
        telemetryEvent('health-1', 'health.passed', 2, { health_status: 'healthy' }),
      ),
    );

    const timeline = await harness.queries.timeline(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
    );
    expect(timeline.map((event) => event.normalizedEventType)).toEqual([
      'deployment.started',
      'deployment.completed',
      'health.check.passed',
    ]);
    expect(timeline[1].payload).toEqual({
      rolloutStatus: 'completed',
      completedNodes: 12,
      targetNodes: 12,
    });
    expect(harness.assessmentRows.at(-1)).toMatchObject({
      state: 'progressing',
      expectedStepKey: 'qoe_validation',
      completionPercent: 75,
    });
  });

  it('declines confidence and intervenes after repeated rollout polls add no evidence', async () => {
    const harness = createHarness();
    const initialEvents = [
      harness.deployment.normalize(
        deploymentEvent('deploy-1', 'rollout.started', 0, { rolloutStatus: 'running' }),
      ),
      harness.deployment.normalize(
        deploymentEvent('deploy-2', 'rollout.completed', 1, {
          rolloutStatus: 'completed',
        }),
      ),
      harness.telemetry.normalize(
        telemetryEvent('health-1', 'health.passed', 2, { healthStatus: 'healthy' }),
      ),
    ];
    for (const event of initialEvents) await harness.events.ingest(event);
    const healthyConfidence = Number(harness.assessmentRows.at(-1)?.confidence);

    for (const [index, minutes] of [4, 8, 15].entries()) {
      await harness.events.ingest(
        harness.deployment.normalize(
          deploymentEvent(`poll-${index + 1}`, 'rollout.polled', minutes, {
            rolloutStatus: 'completed',
          }),
        ),
      );
    }

    const latest = harness.assessmentRows.at(-1);
    expect(latest?.state).toBe('intervention_required');
    expect(Number(latest?.confidence)).toBeLessThan(healthyConfidence);
    expect(latest?.rationale.repeatedNonProgressCount).toBe(3);
    expect(harness.interventionRows).toHaveLength(1);
    expect(harness.interventionRows[0].recommendationText).toContain('validation');
  });

  it('stores unmatched and duplicate source events without evaluating a session twice', async () => {
    const harness = createHarness();
    const unmatched = harness.telemetry.normalize({
      event_id: 'unmatched-1',
      event_type: 'freshness.updated',
      tenant_id: '10000000-0000-4000-8000-000000000001',
      environment_id: '90000000-0000-4000-8000-000000000009',
      workflow_id: 'unknown-rollout',
      recorded_at: iso(3),
      payload: { freshness_seconds: 12 },
    });

    const first = await harness.events.ingest(unmatched);
    const second = await harness.events.ingest(unmatched);

    expect(first).toMatchObject({ matched: false, duplicate: false });
    expect(second).toMatchObject({ matched: false, duplicate: true });
    expect(harness.eventRows).toHaveLength(1);
    expect(harness.eventRows[0].sessionId).toBeNull();
    expect(harness.assessmentRows).toHaveLength(0);
  });
});
