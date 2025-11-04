import pino from 'pino';
import { cfg } from '../config/index.js';

let transport;
if (cfg.NODE_ENV !== 'production') {
  try {
    await import('pino-pretty');
    transport = {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard' }
    };
  } catch (err) {
    transport = undefined;
  }
}

export const logger = pino({
  level: process.env.LOG_LEVEL || (cfg.NODE_ENV === 'production' ? 'info' : 'debug'),
  transport,
});
