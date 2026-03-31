import { GetWeeklyStatsController } from './get-weekly-stats/get-weekly-stats.endpoint';
import { GetWeeklyStatsQueryHandler } from './get-weekly-stats/get-weekly-stats.handler';

export { GetWeeklyStatsController } from './get-weekly-stats/get-weekly-stats.endpoint';
export { GetWeeklyStatsQueryHandler } from './get-weekly-stats/get-weekly-stats.handler';

const controllers = [
  GetWeeklyStatsController,
];

const handlers = [
  GetWeeklyStatsQueryHandler,
];

const analytics = {
  addControllers: () => controllers,
  addHandlers: () => handlers,
};

export default analytics;
