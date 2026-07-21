import { Module } from '@nestjs/common';

import { DatabaseModule } from '../infrastructure/database/database.module';
import { SessionAssessmentService } from './session-assessment.service';
import { SessionCorrelationService } from './session-correlation.service';
import { SessionEvaluationService } from './session-evaluation.service';
import { SessionEventsService } from './session-events.service';
import { SessionsController } from './sessions.controller';
import { SessionsQueryService } from './sessions-query.service';

@Module({
  imports: [DatabaseModule],
  controllers: [SessionsController],
  providers: [
    SessionAssessmentService,
    SessionCorrelationService,
    SessionEvaluationService,
    SessionEventsService,
    SessionsQueryService,
  ],
  exports: [SessionAssessmentService, SessionEventsService],
})
export class SessionStewardApplicationModule {}
