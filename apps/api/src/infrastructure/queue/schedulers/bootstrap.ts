import { logger } from '../../../core/logger/logger.js';

export const bootstrapSchedulers = (): void => {
  logger.info('Queue scheduler bootstrap initialized without registered schedules');
};
