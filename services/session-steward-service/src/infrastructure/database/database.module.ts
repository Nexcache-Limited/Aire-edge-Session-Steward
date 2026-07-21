import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  SessionAssessmentEntity,
  SessionContractEntity,
  SessionContractStepEntity,
  SessionEntity,
  SessionEventEntity,
  SessionEvidenceEntity,
  SessionInterventionEntity,
  SessionSuccessCriterionEntity,
} from './entities';

const entities = [
  SessionEntity,
  SessionContractEntity,
  SessionContractStepEntity,
  SessionSuccessCriterionEntity,
  SessionEventEntity,
  SessionEvidenceEntity,
  SessionAssessmentEntity,
  SessionInterventionEntity,
];

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url:
        process.env.DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5432/session_steward_service',
      entities,
      migrations: [`${__dirname}/migrations/*.{ts,js}`],
      migrationsRun: true,
      synchronize: false,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      logging: process.env.NODE_ENV !== 'production',
    }),
    TypeOrmModule.forFeature(entities),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
