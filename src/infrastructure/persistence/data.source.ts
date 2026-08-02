import * as path from 'path';
import configs from '../../configs';
import { DataSource, DataSourceOptions } from 'typeorm';

export const postgresOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: configs.postgres.synchronize,
  entities: [path.resolve(__dirname + configs.postgres.entities)],
  migrations: [path.resolve(__dirname + configs.postgres.migrations)],
  logging: configs.postgres.logging,
  migrationsRun: configs.postgres.migrationsRun,

  ssl: configs.postgres.ssl?.rejectUnauthorized !== undefined 
    ? { rejectUnauthorized: configs.postgres.ssl.rejectUnauthorized }
    : undefined,
};

const dataSource = new DataSource(postgresOptions);
export default dataSource;
