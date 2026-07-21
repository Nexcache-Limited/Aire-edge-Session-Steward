import { Injectable } from '@nestjs/common';

import type { StewardEventEnvelope } from '../../domain/events/steward-event-envelope';
import {
  optionalString,
  parseSourceEvent,
  requiredString,
  requiredTimestamp,
  sourcePayload,
} from './source-event';

const eventTypes: Record<string, string> = {
  'health.passed': 'health.check.passed',
  health_check_passed: 'health.check.passed',
  'health.check.passed': 'health.check.passed',
  'health.failed': 'health.check.failed',
  health_check_failed: 'health.check.failed',
  'health.check.failed': 'health.check.failed',
  'freshness.updated': 'telemetry.freshness.updated',
  telemetry_freshness_updated: 'telemetry.freshness.updated',
  'telemetry.freshness.updated': 'telemetry.freshness.updated',
};

@Injectable()
export class TelemetryEventNormalizer {
  normalize(value: unknown): StewardEventEnvelope {
    const event = parseSourceEvent(value);
    const sourceEventType = requiredString(
      event,
      'eventType',
      'event_type',
      'type',
      'sourceEventType',
      'source_event_type',
    );
    const normalizedEventType = eventTypes[sourceEventType];
    if (!normalizedEventType) {
      throw new Error(`Unsupported telemetry event type: ${sourceEventType}`);
    }

    return {
      eventId: requiredString(event, 'eventId', 'event_id', 'id'),
      tenantId: requiredString(event, 'tenantId', 'tenant_id'),
      sessionId: optionalString(event, 'sessionId', 'session_id'),
      sourceService: 'telemetry-service',
      sourceEventType,
      normalizedEventType,
      sourceRef: optionalString(
        event,
        'healthCheckId',
        'health_check_id',
        'edge_node_id',
        'sourceRef',
        'source_ref',
      ),
      environmentId: optionalString(event, 'environmentId', 'environment_id'),
      workflowId: optionalString(event, 'workflowId', 'workflow_id', 'rolloutId', 'rollout_id'),
      occurredAt: requiredTimestamp(
        event,
        'occurredAt',
        'occurred_at',
        'recorded_at',
        'checked_at',
        'timestamp',
      ),
      payload: sourcePayload(event),
    };
  }
}
