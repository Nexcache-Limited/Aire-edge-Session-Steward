import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  SessionAssessmentEntity,
  SessionContractEntity,
  SessionContractTemplateEntity,
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
  SessionContractTemplateEntity,
  SessionContractStepEntity,
  SessionSuccessCriterionEntity,
  SessionEventEntity,
  SessionEvidenceEntity,
  SessionAssessmentEntity,
  SessionInterventionEntity,
];

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>(
          'DATABASE_URL',
          'postgresql://postgres:postgres@localhost:5432/session_steward_service',
        ),
        entities,
        migrations: [`${__dirname}/migrations/*.{ts,js}`],
        migrationsRun: true,
        synchronize: false,
        ssl:
          config.get<string>('NODE_ENV') === 'production'
            ? { rejectUnauthorized: false }
            : false,
        logging: config.get<string>('NODE_ENV') !== 'production',
      }),
    }),
    TypeOrmModule.forFeature(entities),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
