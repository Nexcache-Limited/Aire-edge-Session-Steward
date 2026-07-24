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
  'artifact.recorded': 'evidence.recorded',
  evidence_artifact_recorded: 'evidence.recorded',
  'evidence.recorded': 'evidence.recorded',
  'pack.updated': 'evidence.pack.updated',
  evidence_pack_updated: 'evidence.pack.updated',
  'evidence.pack.updated': 'evidence.pack.updated',
  'citation.linked': 'evidence.citation.linked',
  evidence_citation_linked: 'evidence.citation.linked',
  'evidence.citation.linked': 'evidence.citation.linked',
  'note.attached': 'evidence.note.attached',
  experiment_note_attached: 'evidence.note.attached',
  'evidence.note.attached': 'evidence.note.attached',
};

@Injectable()
export class EvidenceEventNormalizer {
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
      throw new Error(`Unsupported evidence event type: ${sourceEventType}`);
    }

    return {
      eventId: requiredString(event, 'eventId', 'event_id', 'id'),
      tenantId: requiredString(event, 'tenantId', 'tenant_id'),
      sessionId: optionalString(event, 'sessionId', 'session_id'),
      sourceService: 'evidence-service',
      sourceEventType,
      normalizedEventType,
      sourceRef: optionalString(
        event,
        'artifactId',
        'artifact_id',
        'packageId',
        'package_id',
        'citationId',
        'citation_id',
        'noteId',
        'note_id',
        'sourceRef',
        'source_ref',
      ),
      environmentId: optionalString(event, 'environmentId', 'environment_id'),
      workflowId: optionalString(
        event,
        'workflowId',
        'workflow_id',
        'rolloutId',
        'rollout_id',
        'deploymentId',
        'deployment_id',
      ),
      occurredAt: requiredTimestamp(
        event,
        'occurredAt',
        'occurred_at',
        'recordedAt',
        'recorded_at',
        'updatedAt',
        'updated_at',
        'timestamp',
      ),
      payload: sourcePayload(event),
    };
  }
}
