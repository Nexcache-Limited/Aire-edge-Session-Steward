import { DeploymentEventNormalizer } from './deployment-event.normalizer';
import { TelemetryEventNormalizer } from './telemetry-event.normalizer';
import { TrainingEventNormalizer } from './training-event.normalizer';

const base = {
  event_id: 'event-1',
  tenant_id: '10000000-0000-4000-8000-000000000001',
  environment_id: '20000000-0000-4000-8000-000000000001',
  workflow_id: 'rollout-edge-v18',
  occurred_at: '2026-07-21T09:00:00.000Z',
  payload: { status: 'healthy' },
};

describe('source event normalizers', () => {
  const deployment = new DeploymentEventNormalizer();
  const telemetry = new TelemetryEventNormalizer();
  const training = new TrainingEventNormalizer();

  it.each([
    ['rollout.started', 'deployment.started'],
    ['rollout.completed', 'deployment.completed'],
    ['rollout.polled', 'deployment.polled'],
    ['rollout.failed', 'deployment.failed'],
  ])('maps deployment %s to %s', (eventType, expected) => {
    expect(deployment.normalize({ ...base, event_type: eventType })).toMatchObject({
      sourceService: 'deployment-service',
      sourceEventType: eventType,
      normalizedEventType: expected,
    });
  });

  it.each([
    ['health.passed', 'health.check.passed'],
    ['health.failed', 'health.check.failed'],
    ['freshness.updated', 'telemetry.freshness.updated'],
  ])('maps telemetry %s to %s', (eventType, expected) => {
    expect(telemetry.normalize({ ...base, event_type: eventType })).toMatchObject({
      sourceService: 'telemetry-service',
      sourceEventType: eventType,
      normalizedEventType: expected,
    });
  });

  it('rejects unsupported event types and invalid timestamps', () => {
    expect(() => deployment.normalize({ ...base, event_type: 'rollout.deleted' })).toThrow(
      'Unsupported deployment event type',
    );
    expect(() =>
      telemetry.normalize({
        ...base,
        event_type: 'health.passed',
        occurred_at: 'not-a-timestamp',
      }),
    ).toThrow('must be an ISO-8601 timestamp');
  });

  it.each([
    ['TrainingStarted', 'training.started'],
    ['CheckpointProduced', 'training.checkpoint.produced'],
    ['ValidationMetricRecorded', 'training.validation.metric.recorded'],
    ['TrainingCompleted', 'training.completed'],
    ['TrainingFailed', 'training.failed'],
  ])('maps AIRE-Edge %s to %s and correlates by training session', (eventType, expected) => {
    expect(
      training.normalize({
        event_id: '50000000-0000-4000-8000-000000000001',
        timestamp: '2026-07-25T09:00:00.000Z',
        tenant_id: base.tenant_id,
        training_session_id: '30000000-0000-4000-8000-000000000001',
        run_id: 'mlflow-run-42',
        environment: 'stg',
        provider: 'vast',
        event_type: eventType,
        version: 'v1',
        deployment_id: null,
        payload: { converged: true },
      }),
    ).toMatchObject({
      sessionId: '30000000-0000-4000-8000-000000000001',
      workflowId: 'mlflow-run-42',
      sourceService: 'ai-orchestration-service',
      sourceEventType: eventType,
      normalizedEventType: expected,
      payload: {
        environment: 'stg',
        provider: 'vast',
        trainingSessionId: '30000000-0000-4000-8000-000000000001',
      },
    });
  });
});
