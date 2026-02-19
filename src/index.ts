/**
 * Data Mirror — точка входа
 */

import express from 'express'
import { config } from './config/index.js'
import { DataCollector } from './collectors/index.js'
import { createApiRouter, updateMetrics } from './api/index.js'
import { createLogger } from './utils/logger.js'

const logger = createLogger('main')

const app = express()
app.use(express.json())

const collector = new DataCollector()
app.use('/api/v1', createApiRouter(collector))

let isShuttingDown = false

async function shutdown(signal: string) {
  if (isShuttingDown) return
  isShuttingDown = true
  logger.info({ signal }, 'Получен сигнал завершения...')
  try {
    await collector.stop()
    logger.info('Graceful shutdown завершён')
    process.exit(0)
  } catch (error) {
    logger.error({ error }, 'Ошибка при shutdown')
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('uncaughtException', (error) => { logger.fatal({ error }, 'Uncaught exception'); shutdown('uncaughtException') })
process.on('unhandledRejection', (reason) => { logger.fatal({ reason }, 'Unhandled rejection') })

async function start() {
  try {
    logger.info({ port: config.port, storage: config.storage.type }, 'Запуск Data Mirror')
    await collector.start()
    app.listen(config.port, () => {
      logger.info(`Data Mirror слушает порт ${config.port}`)
      logger.info(`Health: http://localhost:${config.port}/api/v1/health`)
    })
    setInterval(() => updateMetrics(collector), 30000)
  } catch (error) {
    logger.fatal({ error }, 'Ошибка запуска')
    process.exit(1)
  }
}

start()
