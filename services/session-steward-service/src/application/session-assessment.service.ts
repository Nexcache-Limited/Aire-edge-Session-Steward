import { Injectable } from '@nestjs/common';

import { SessionEngine, SessionEngineInput } from '../domain/session-engine/session-engine';
import type { SessionAssessmentDraft } from '../domain/session-engine/session-types';

@Injectable()
export class SessionAssessmentService {
  private readonly engine = new SessionEngine();

  assess(input: SessionEngineInput): SessionAssessmentDraft {
    return this.engine.assess(input);
  }
}
