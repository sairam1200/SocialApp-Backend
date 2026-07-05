import * as path from 'path';
import configs from '../../configs';
import { DataSource, DataSourceOptions } from 'typeorm';

export const postgresOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: configs.postgres.synchronize,
  entities: [path.resolve(__dirname + configs.postgres.entities)],
  logging: configs.postgres.logging,
  migrationsRun: configs.postgres.migrationsRun,

  ssl: {
    rejectUnauthorized: false,
  },
};

const dataSource = new DataSource(postgresOptions);
export default dataSource;