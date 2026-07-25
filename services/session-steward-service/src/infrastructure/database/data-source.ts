import 'reflect-metadata';

import { DataSource } from 'typeorm';

import { databaseEntities } from './database.module';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is required for migration commands.');
}

export default new DataSource({
  type: 'postgres',
  url,
  entities: databaseEntities,
  migrations: [`${__dirname}/migrations/*.{ts,js}`],
  migrationsTableName: 'migrations',
  synchronize: false,
  ssl:
    process.env.NODE_ENV === 'production'
      ? {
          rejectUnauthorized:
            process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
        }
      : false,
});
