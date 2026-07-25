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

export const databaseEntities = [
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
        url: databaseUrl(config),
        entities: databaseEntities,
        migrations: [`${__dirname}/migrations/*.{ts,js}`],
        migrationsRun: config.get<string>('MIGRATIONS_RUN', 'false') === 'true',
        synchronize: false,
        ssl:
          config.get<string>('NODE_ENV') === 'production'
            ? {
                rejectUnauthorized:
                  config.get<string>('DATABASE_SSL_REJECT_UNAUTHORIZED', 'true') !== 'false',
              }
            : false,
        logging: config.get<string>('NODE_ENV') !== 'production',
      }),
    }),
    TypeOrmModule.forFeature(databaseEntities),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}

function databaseUrl(config: ConfigService): string {
  const value = config.get<string>('DATABASE_URL');
  if (value) return value;
  if (config.get<string>('NODE_ENV') === 'production') {
    throw new Error('DATABASE_URL is required in production.');
  }
  return 'postgresql://postgres:postgres@localhost:5432/session_steward_service';
}
