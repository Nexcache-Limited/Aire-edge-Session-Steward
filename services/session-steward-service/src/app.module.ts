import { Module } from '@nestjs/common';

import { SessionStewardApplicationModule } from './application/session-steward-application.module';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './infrastructure/database/database.module';

@Module({
  imports: [DatabaseModule, SessionStewardApplicationModule, HealthModule],
})
export class AppModule {}
