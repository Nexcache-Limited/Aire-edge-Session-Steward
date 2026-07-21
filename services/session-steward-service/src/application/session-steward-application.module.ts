import { Module } from '@nestjs/common';

import { SessionAssessmentService } from './session-assessment.service';

@Module({
  providers: [SessionAssessmentService],
  exports: [SessionAssessmentService],
})
export class SessionStewardApplicationModule {}
