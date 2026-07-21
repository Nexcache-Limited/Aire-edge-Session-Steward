import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { SessionStewardApplicationModule } from './application/session-steward-application.module';
import { HealthModule } from './health/health.module';
import { SessionIngestModule } from './infrastructure/ingest/session-ingest.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SessionStewardApplicationModule,
    SessionIngestModule,
    HealthModule,
  ],
})
export class AppModule {}
