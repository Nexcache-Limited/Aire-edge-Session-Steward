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
  'baseline.validation.started': 'qoe.baseline.started',
  baseline_validation_started: 'qoe.baseline.started',
  'qoe.baseline.started': 'qoe.baseline.started',
  'baseline.validation.completed': 'qoe.baseline.completed',
  baseline_validation_completed: 'qoe.baseline.completed',
  'qoe.baseline.completed': 'qoe.baseline.completed',
  'post_change.validation.started': 'qoe.validation.started',
  post_change_validation_started: 'qoe.validation.started',
  'validation.started': 'qoe.validation.started',
  'qoe.validation.started': 'qoe.validation.started',
  'post_change.validation.completed': 'qoe.validation.completed',
  post_change_validation_completed: 'qoe.validation.completed',
  'validation.completed': 'qoe.validation.completed',
  'qoe.validation.completed': 'qoe.validation.completed',
  'comparison.generated': 'qoe.comparison.generated',
  qoe_comparison_generated: 'qoe.comparison.generated',
  'qoe.comparison.generated': 'qoe.comparison.generated',
  'recommendation.generated': 'qoe.recommendation.generated',
  promotion_recommendation_generated: 'qoe.recommendation.generated',
  'qoe.recommendation.generated': 'qoe.recommendation.generated',
  'validation.failed': 'qoe.validation.failed',
  qoe_validation_failed: 'qoe.validation.failed',
  'qoe.validation.failed': 'qoe.validation.failed',
};

@Injectable()
export class QoeEventNormalizer {
  normalize(value: unknown): StewardEventEnvelope {
    const event = parseSourceEvent(value);
    const payload = sourcePayload(event);
    const sourceEventType = requiredString(
      event,
      'eventType',
      'event_type',
      'type',
      'sourceEventType',
      'source_event_type',
    );
    let normalizedEventType = eventTypes[sourceEventType];
    if (sourceEventType === 'QoEScoreEvent') {
      const phase = optionalString(payload, 'phase', 'validationPhase', 'validation_phase');
      normalizedEventType = phase === 'baseline' ? 'qoe.baseline.completed' : 'qoe.validation.completed';
    }
    if (!normalizedEventType) throw new Error(`Unsupported QoE event type: ${sourceEventType}`);

    const deploymentId = optionalString(event, 'deploymentId', 'deployment_id');
    return {
      eventId: requiredString(event, 'eventId', 'event_id', 'id'),
      tenantId: requiredString(event, 'tenantId', 'tenant_id'),
      sessionId: optionalString(event, 'sessionId', 'session_id'),
      sourceService: 'qoe-service',
      sourceEventType,
      normalizedEventType,
      sourceRef: optionalString(
        event,
        'validationId',
        'validation_id',
        'comparisonId',
        'comparison_id',
        'recommendationId',
        'recommendation_id',
        'sourceRef',
        'source_ref',
        'deploymentId',
        'deployment_id',
      ),
      environmentId: optionalString(event, 'environmentId', 'environment_id'),
      workflowId: optionalString(
        event,
        'workflowId',
        'workflow_id',
        'rolloutId',
        'rollout_id',
      ) ?? deploymentId,
      occurredAt: requiredTimestamp(
        event,
        'occurredAt',
        'occurred_at',
        'recordedAt',
        'recorded_at',
        'timestamp',
      ),
      payload,
    };
  }
}
