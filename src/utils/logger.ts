/**
 * Модуль логирования на базе Pino
 */

import pino from 'pino'
import { config } from '../config/index.js'

export const logger = pino({
  level: config.logging.level,
  transport: config.logging.pretty
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname'
        }
      }
    : undefined
})

export const createLogger = (module: string) => logger.child({ module })
