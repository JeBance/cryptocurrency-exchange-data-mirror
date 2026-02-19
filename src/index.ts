/**
 * Data Mirror — точка входа
 */

import express from 'express'
import { randomBytes } from 'crypto'
import { config } from './config/index.js'
import { DataCollector } from './collectors/index.js'
import { createApiRouter, updateMetrics } from './api/index.js'
import { createLogger } from './utils/logger.js'

const logger = createLogger('main')

// Генерация API ключа при запуске
function generateApiKey(): string {
  return randomBytes(32).toString('hex')
}

// API ключ (можно задать через env или генерируется автоматически)
const API_KEY = process.env.API_KEY || generateApiKey()
const API_KEY_HEADER = 'X-API-Key'

// Middleware для проверки API ключа
function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  // Health endpoint доступен без ключа
  if (req.path === '/api/v1/health') {
    return next()
  }
  
  // Проверяем ключ в заголовке
  const providedKey = req.headers[API_KEY_HEADER.toLowerCase()] as string | undefined
  
  if (!providedKey || providedKey !== API_KEY) {
    logger.warn({ ip: req.ip, path: req.path }, 'Несанкционированный доступ')
    return res.status(401).json({ 
      success: false, 
      error: 'Требуется API ключ. Передайте заголовок X-API-Key' 
    })
  }
  
  next()
}

const app = express()

// CORS middleware — разрешает запросы с любого домена (для GitHub Pages UI)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', `Content-Type, Authorization, ${API_KEY_HEADER}`)
  
  // Обработка preflight запросов
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200)
  }
  
  next()
})

app.use(express.json())

// Защита API ключом
app.use(authMiddleware)

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
      console.log('')
      console.log('╔════════════════════════════════════════════════════════════════╗')
      console.log('║                    DATA MIRROR ЗАПУЩЕН                         ║')
      console.log('╠════════════════════════════════════════════════════════════════╣')
      console.log(`║  Порт:       ${config.port.toString().padEnd(50)}║`)
      console.log(`║  Хранилище:  ${config.storage.type.padEnd(50)}║`)
      console.log('╠════════════════════════════════════════════════════════════════╣')
      console.log('║  🔑 API КЛЮЧ (сохраните его!):                                  ║')
      console.log(`║                                                                  ║`)
      console.log(`║  ${API_KEY}                    ║`)
      console.log('╠════════════════════════════════════════════════════════════════╣')
      console.log('║  Health: http://localhost:' + config.port + '/api/v1/health                  ║')
      console.log('╚════════════════════════════════════════════════════════════════╝')
      console.log('')
      logger.info('Передайте API ключ в заголовке X-API-Key для доступа к API')
    })
    
    setInterval(() => updateMetrics(collector), 30000)
  } catch (error) {
    logger.fatal({ error }, 'Ошибка запуска')
    process.exit(1)
  }
}

start()
