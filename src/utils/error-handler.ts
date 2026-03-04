import { logger } from './logger';

const log = logger.child({ name: 'error-handler' });

/**
 * Setup global error handlers
 */
export const setupErrorHandlers = () => {
  process.on('unhandledRejection', (reason, promise) => {
    log.error({ reason, promise }, 'Unhandled Rejection');
  });

  process.on('uncaughtException', (error) => {
    log.fatal({ error }, 'Uncaught Exception');
    process.exit(1);
  });

  process.on('SIGINT', () => {
    log.info('Received SIGINT. Graceful shutdown...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    log.info('Received SIGTERM. Graceful shutdown...');
    process.exit(0);
  });
};
