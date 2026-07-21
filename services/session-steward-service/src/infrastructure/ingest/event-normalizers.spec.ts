import { DeploymentEventNormalizer } from './deployment-event.normalizer';
import { TelemetryEventNormalizer } from './telemetry-event.normalizer';

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
});
