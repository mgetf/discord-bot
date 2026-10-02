import type { EventEmitter } from 'node:events';
import { logger } from './logger';

const log = logger.child({ name: 'error-handler' });
const processEvents = process as unknown as EventEmitter;

/**
 * Setup global error handlers
 */
export const setupErrorHandlers = () => {
  processEvents.on('unhandledRejection', (reason: unknown) => {
    if (reason instanceof Error) {
      log.error({ err: reason }, 'Unhandled Rejection');
    } else {
      log.error({ reason: String(reason) }, 'Unhandled Rejection');
    }
  });

  processEvents.on('uncaughtException', (error: Error) => {
    log.fatal({ error }, 'Uncaught Exception');
    process.exit(1);
  });

  processEvents.on('SIGINT', () => {
    log.info('Received SIGINT. Graceful shutdown...');
    process.exit(0);
  });

  processEvents.on('SIGTERM', () => {
    log.info('Received SIGTERM. Graceful shutdown...');
    process.exit(0);
  });
};
