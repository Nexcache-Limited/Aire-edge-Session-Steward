import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';

import type { StewardEventEnvelope } from '../domain/events/steward-event-envelope';
import { SessionEntity } from '../infrastructure/database/entities';

@Injectable()
export class SessionCorrelationService {
  constructor(
    @InjectRepository(SessionEntity)
    private readonly sessions: Repository<SessionEntity>,
  ) {}

  async correlate(envelope: StewardEventEnvelope): Promise<SessionEntity | null> {
    if (envelope.sessionId) {
      return this.sessions.findOne({
        where: {
          id: envelope.sessionId,
          tenantId: envelope.tenantId,
          status: 'active',
        },
      });
    }

    if (!envelope.workflowId && !envelope.environmentId) return null;

    const where: FindOptionsWhere<SessionEntity> = {
      tenantId: envelope.tenantId,
      status: 'active',
    };
    if (envelope.workflowId) where.workflowId = envelope.workflowId;
    if (envelope.environmentId) where.environmentId = envelope.environmentId;

    return this.sessions.findOne({ where, order: { updatedAt: 'DESC' } });
  }
}
