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
  TrainingStarted: 'training.started',
  CheckpointProduced: 'training.checkpoint.produced',
  ValidationMetricRecorded: 'training.validation.metric.recorded',
  TrainingCompleted: 'training.completed',
  TrainingFailed: 'training.failed',
};

@Injectable()
export class TrainingEventNormalizer {
  normalize(value: unknown): StewardEventEnvelope {
    const event = parseSourceEvent(value);
    const sourceEventType = requiredString(event, 'event_type', 'eventType');
    const normalizedEventType = eventTypes[sourceEventType];
    if (!normalizedEventType) {
      throw new Error(`Unsupported training event type: ${sourceEventType}`);
    }

    const trainingSessionId = requiredString(
      event,
      'training_session_id',
      'trainingSessionId',
    );
    const runId = optionalString(event, 'run_id', 'runId');
    const payload = sourcePayload(event);

    return {
      eventId: requiredString(event, 'event_id', 'eventId'),
      tenantId: requiredString(event, 'tenant_id', 'tenantId'),
      sessionId: trainingSessionId,
      sourceService: 'ai-orchestration-service',
      sourceEventType,
      normalizedEventType,
      sourceRef: runId ?? trainingSessionId,
      workflowId: runId ?? trainingSessionId,
      occurredAt: requiredTimestamp(event, 'timestamp', 'occurred_at', 'occurredAt'),
      payload: {
        ...payload,
        trainingSessionId,
        runId,
        environment: optionalString(event, 'environment'),
        provider: optionalString(event, 'provider'),
        version: optionalString(event, 'version'),
      },
    };
  }
}
