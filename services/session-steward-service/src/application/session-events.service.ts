import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import type { StewardEventEnvelope } from '../domain/events/steward-event-envelope';
import { SessionEventEntity } from '../infrastructure/database/entities';
import { SessionCorrelationService } from './session-correlation.service';
import { SessionEvaluationService } from './session-evaluation.service';

export interface IngestedStewardEvent {
  event: SessionEventEntity;
  assessmentId?: string;
  matched: boolean;
  duplicate: boolean;
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError = error.driverError as unknown;
  return (
    driverError !== null &&
    typeof driverError === 'object' &&
    'code' in driverError &&
    driverError.code === '23505'
  );
}

@Injectable()
export class SessionEventsService {
  constructor(
    @InjectRepository(SessionEventEntity)
    private readonly events: Repository<SessionEventEntity>,
    private readonly correlation: SessionCorrelationService,
    private readonly evaluation: SessionEvaluationService,
  ) {}

  async ingest(envelope: StewardEventEnvelope): Promise<IngestedStewardEvent> {
    const duplicate = await this.events.findOne({
      where: {
        tenantId: envelope.tenantId,
        sourceService: envelope.sourceService,
        externalEventId: envelope.eventId,
      },
    });
    if (duplicate) {
      return {
        event: duplicate,
        matched: duplicate.sessionId !== null,
        duplicate: true,
      };
    }

    const session = await this.correlation.correlate(envelope);
    const candidate = this.events.create({
        sessionId: session?.id ?? null,
        externalEventId: envelope.eventId,
        tenantId: envelope.tenantId,
        sourceService: envelope.sourceService,
        sourceEventType: envelope.sourceEventType,
        normalizedEventType: envelope.normalizedEventType,
        sourceRef: envelope.sourceRef ?? null,
        workflowId: envelope.workflowId ?? null,
        environmentId: envelope.environmentId ?? null,
        occurredAt: new Date(envelope.occurredAt),
        payload: envelope.payload,
      });
    let event: SessionEventEntity;
    try {
      event = await this.events.save(candidate);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const concurrentDuplicate = await this.events.findOne({
        where: {
          tenantId: envelope.tenantId,
          sourceService: envelope.sourceService,
          externalEventId: envelope.eventId,
        },
      });
      if (!concurrentDuplicate) throw error;
      return {
        event: concurrentDuplicate,
        matched: concurrentDuplicate.sessionId !== null,
        duplicate: true,
      };
    }

    if (!session) return { event, matched: false, duplicate: false };

    const assessment = await this.evaluation.evaluate(session.id, envelope.occurredAt);
    return {
      event,
      assessmentId: assessment.id,
      matched: true,
      duplicate: false,
    };
  }
}
