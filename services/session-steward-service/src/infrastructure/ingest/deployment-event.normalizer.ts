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
  'rollout.started': 'deployment.started',
  rollout_started: 'deployment.started',
  'deployment.started': 'deployment.started',
  'rollout.completed': 'deployment.completed',
  rollout_completed: 'deployment.completed',
  'deployment.completed': 'deployment.completed',
  'rollout.polled': 'deployment.polled',
  rollout_polled: 'deployment.polled',
  'deployment.polled': 'deployment.polled',
  'rollout.failed': 'deployment.failed',
  rollout_failed: 'deployment.failed',
  'deployment.failed': 'deployment.failed',
};

@Injectable()
export class DeploymentEventNormalizer {
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
      throw new Error(`Unsupported deployment event type: ${sourceEventType}`);
    }

    const sourceRef = optionalString(
      event,
      'rolloutId',
      'rollout_id',
      'deployment_id',
      'sourceRef',
      'source_ref',
    );
    return {
      eventId: requiredString(event, 'eventId', 'event_id', 'id'),
      tenantId: requiredString(event, 'tenantId', 'tenant_id'),
      sessionId: optionalString(event, 'sessionId', 'session_id'),
      sourceService: 'deployment-service',
      sourceEventType,
      normalizedEventType,
      sourceRef,
      environmentId: optionalString(event, 'environmentId', 'environment_id'),
      workflowId: optionalString(event, 'workflowId', 'workflow_id', 'rolloutId', 'rollout_id'),
      occurredAt: requiredTimestamp(
        event,
        'occurredAt',
        'occurred_at',
        'timestamp',
        'updated_at',
      ),
      payload: sourcePayload(event),
    };
  }
}
