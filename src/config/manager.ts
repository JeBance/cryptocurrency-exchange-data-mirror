/**
 * Менеджер конфигурации
 * Управление .env файлом через API
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { config, type ExchangeName, type DataType, type SymbolConfig } from './index.js'
import { createLogger } from '../utils/logger.js'

const logger = createLogger('config-manager')

export interface ConfigUpdate {
  exchanges?: {
    binance?: {
      enabled?: boolean
      markets?: string[]
      symbols?: string[]
    }
    bybit?: {
      enabled?: boolean
      markets?: string[]
      symbols?: string[]
    }
  }
  storage?: {
    type?: 'file' | 'mongodb'
    path?: string
    mongoUrl?: string
    mongoDb?: string
  }
}

export interface FullConfig {
  port: number
  apiKey: string
  exchanges: {
    binance: {
      enabled: boolean
      markets: string[]
      symbols: SymbolConfig[]
      wsUrl: string
      restUrl: string
    }
    bybit: {
      enabled: boolean
      markets: string[]
      symbols: SymbolConfig[]
      wsUrl: string
      restUrl: string
    }
  }
  storage: {
    type: 'file' | 'mongodb'
    path?: string
    mongoUrl?: string
    mongoDb?: string
    batchSize: number
    flushIntervalMs: number
    maxFileSizeMb: number
  }
  logging: {
    level: string
    pretty: boolean
  }
  reconnect: {
    maxRetries: number
    baseDelayMs: number
    maxDelayMs: number
  }
}

// Путь к .env файлу
const ENV_PATH = join(process.cwd(), '.env')

/**
 * Чтение .env файла в объект
 */
function readEnvFile(): Record<string, string> {
  const env: Record<string, string> = {}
  
  if (!existsSync(ENV_PATH)) {
    logger.warn('.env файл не найден, используется конфигурация по умолчанию')
    return env
  }

  const content = readFileSync(ENV_PATH, 'utf-8')
  const lines = content.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    
    const key = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1).trim()
    env[key] = value
  }

  return env
}

/**
 * Запись объекта в .env файл с сохранением комментариев
 */
function writeEnvFile(env: Record<string, string>): void {
  let content = `# ===========================================
# DATA MIRROR - Конфигурация
# ===========================================

# ----------------
# ОСНОВНЫЕ НАСТРОЙКИ
# ----------------

# Порт REST API
PORT=${env.PORT || 3030}

# API ключ для защиты доступа
API_KEY=${env.API_KEY || ''}

# ----------------
# ЛОГИРОВАНИЕ
# ----------------

# Уровень логирования: trace, debug, info, warn, error, fatal
LOG_LEVEL=${env.LOG_LEVEL || 'info'}

# Формат логов: true = красиво оформленные, false = JSON
LOG_PRETTY=${env.LOG_PRETTY || 'true'}

# ----------------
# ХРАНИЛИЩЕ ДАННЫХ
# ----------------

# Тип хранилища: file или mongodb
STORAGE_TYPE=${env.STORAGE_TYPE || 'file'}

# Путь к папке для файлового хранилища
STORAGE_PATH=${env.STORAGE_PATH || './data'}

# Максимальный размер файла в МБ
MAX_FILE_SIZE_MB=${env.MAX_FILE_SIZE_MB || '100'}

# URL подключения к MongoDB (для STORAGE_TYPE=mongodb)
MONGO_URL=${env.MONGO_URL || ''}

# Имя базы данных MongoDB
MONGO_DB=${env.MONGO_DB || 'data_mirror'}

# Размер пакета для буферизированной записи
BATCH_SIZE=${env.BATCH_SIZE || '1000'}

# Интервал сброса буфера в миллисекундах
FLUSH_INTERVAL_MS=${env.FLUSH_INTERVAL_MS || '5000'}

# ----------------
# RECONNECTION НАСТРОЙКИ
# ----------------

# Максимальное количество попыток переподключения
RECONNECT_MAX_RETRIES=${env.RECONNECT_MAX_RETRIES || '10'}

# Базовая задержка переподключения в мс
RECONNECT_BASE_DELAY_MS=${env.RECONNECT_BASE_DELAY_MS || '1000'}

# Максимальная задержка переподключения в мс
RECONNECT_MAX_DELAY_MS=${env.RECONNECT_MAX_DELAY_MS || '60000'}

# ----------------
# BINANCE НАСТРОЙКИ
# ----------------

# Включить/выключить Binance
BINANCE_ENABLED=${env.BINANCE_ENABLED || 'true'}

# Типы рынков: spot, futures, derivatives (через запятую)
BINANCE_MARKETS=${env.BINANCE_MARKETS || 'spot'}

# Торговые пары (через запятую)
BINANCE_SYMBOLS=${env.BINANCE_SYMBOLS || 'BTCUSDT,ETHUSDT'}

# WebSocket URL
BINANCE_WS_URL=${env.BINANCE_WS_URL || 'wss://stream.binance.com:9443/ws'}

# REST API URL
BINANCE_REST_URL=${env.BINANCE_REST_URL || 'https://api.binance.com'}

# ----------------
# BYBIT НАСТРОЙКИ
# ----------------

# Включить/выключить Bybit
BYBIT_ENABLED=${env.BYBIT_ENABLED || 'true'}

# Типы рынков: spot, derivatives (через запятую)
BYBIT_MARKETS=${env.BYBIT_MARKETS || 'spot'}

# Торговые пары (через запятую)
BYBIT_SYMBOLS=${env.BYBIT_SYMBOLS || 'BTCUSDT,ETHUSDT'}

# WebSocket URL
BYBIT_WS_URL=${env.BYBIT_WS_URL || 'wss://stream.bybit.com/v5/public/spot'}

# REST API URL
BYBIT_REST_URL=${env.BYBIT_REST_URL || 'https://api.bybit.com'}
`

  writeFileSync(ENV_PATH, content, 'utf-8')
  logger.info('.env файл обновлён')
}

/**
 * Получить полную конфигурацию
 */
export function getFullConfig(): FullConfig {
  return {
    port: config.port,
    apiKey: process.env.API_KEY || '',
    exchanges: {
      binance: {
        enabled: config.exchanges.binance.enabled,
        markets: config.exchanges.binance.markets,
        symbols: config.exchanges.binance.symbols,
        wsUrl: config.exchanges.binance.wsUrl || '',
        restUrl: config.exchanges.binance.restUrl || ''
      },
      bybit: {
        enabled: config.exchanges.bybit.enabled,
        markets: config.exchanges.bybit.markets,
        symbols: config.exchanges.bybit.symbols,
        wsUrl: config.exchanges.bybit.wsUrl || '',
        restUrl: config.exchanges.bybit.restUrl || ''
      }
    },
    storage: {
      type: config.storage.type,
      path: config.storage.path,
      mongoUrl: config.storage.mongoUrl,
      mongoDb: config.storage.mongoDb,
      batchSize: config.storage.batchSize,
      flushIntervalMs: config.storage.flushIntervalMs,
      maxFileSizeMb: config.storage.maxFileSizeMb
    },
    logging: {
      level: config.logging.level,
      pretty: config.logging.pretty
    },
    reconnect: config.reconnect
  }
}

/**
 * Обновить символы для биржи
 */
export function updateSymbols(exchange: ExchangeName, symbols: string[]): void {
  const env = readEnvFile()
  const key = exchange.toUpperCase() + '_SYMBOLS'
  env[key] = symbols.join(',')
  writeEnvFile(env)
  
  // Обновляем конфигурацию в памяти
  if (exchange === 'binance') {
    config.exchanges.binance.symbols = parseSymbolsList(symbols)
  } else if (exchange === 'bybit') {
    config.exchanges.bybit.symbols = parseSymbolsList(symbols)
  }
  
  logger.info({ exchange, symbols }, 'Символы обновлены')
}

/**
 * Добавить символ к бирже
 */
export function addSymbol(exchange: ExchangeName, symbol: string): void {
  const env = readEnvFile()
  const key = exchange.toUpperCase() + '_SYMBOLS'
  const currentSymbols = (env[key] || '').split(',').map(s => s.trim()).filter(Boolean)
  
  if (!currentSymbols.includes(symbol)) {
    currentSymbols.push(symbol)
    env[key] = currentSymbols.join(',')
    writeEnvFile(env)
    
    // Обновляем конфигурацию в памяти
    if (exchange === 'binance') {
      config.exchanges.binance.symbols = parseSymbolsList(currentSymbols)
    } else if (exchange === 'bybit') {
      config.exchanges.bybit.symbols = parseSymbolsList(currentSymbols)
    }
    
    logger.info({ exchange, symbol }, 'Символ добавлен в конфигурацию')
  }
}

/**
 * Удалить символ из биржи
 */
export function removeSymbol(exchange: ExchangeName, symbol: string): void {
  const env = readEnvFile()
  const key = exchange.toUpperCase() + '_SYMBOLS'
  const currentSymbols = (env[key] || '').split(',').map(s => s.trim()).filter(Boolean)
  
  const index = currentSymbols.indexOf(symbol)
  if (index !== -1) {
    currentSymbols.splice(index, 1)
    env[key] = currentSymbols.join(',')
    writeEnvFile(env)
    
    // Обновляем конфигурацию в памяти
    if (exchange === 'binance') {
      config.exchanges.binance.symbols = parseSymbolsList(currentSymbols)
    } else if (exchange === 'bybit') {
      config.exchanges.bybit.symbols = parseSymbolsList(currentSymbols)
    }
    
    logger.info({ exchange, symbol }, 'Символ удалён из конфигурации')
  }
}

/**
 * Обновить markets для биржи
 */
export function updateMarkets(exchange: ExchangeName, markets: string[]): void {
  const env = readEnvFile()
  const key = exchange.toUpperCase() + '_MARKETS'
  env[key] = markets.join(',')
  writeEnvFile(env)
  
  // Обновляем конфигурацию в памяти
  if (exchange === 'binance') {
    config.exchanges.binance.markets = markets as any[]
  } else if (exchange === 'bybit') {
    config.exchanges.bybit.markets = markets as any[]
  }
  
  logger.info({ exchange, markets }, 'Markets обновлены')
}

/**
 * Обновить настройку enabled для биржи
 */
export function setExchangeEnabled(exchange: ExchangeName, enabled: boolean): void {
  const env = readEnvFile()
  const key = exchange.toUpperCase() + '_ENABLED'
  env[key] = enabled ? 'true' : 'false'
  writeEnvFile(env)
  
  // Обновляем конфигурацию в памяти
  if (exchange === 'binance') {
    config.exchanges.binance.enabled = enabled
  } else if (exchange === 'bybit') {
    config.exchanges.bybit.enabled = enabled
  }
  
  logger.info({ exchange, enabled }, 'Enabled обновлено')
}

/**
 * Обновить хранилище
 */
export function updateStorage(settings: { type?: 'file' | 'mongodb'; path?: string; mongoUrl?: string; mongoDb?: string }): void {
  const env = readEnvFile()
  
  if (settings.type) {
    env.STORAGE_TYPE = settings.type
    config.storage.type = settings.type
  }
  if (settings.path !== undefined) {
    env.STORAGE_PATH = settings.path
    config.storage.path = settings.path
  }
  if (settings.mongoUrl !== undefined) {
    env.MONGO_URL = settings.mongoUrl
    config.storage.mongoUrl = settings.mongoUrl
  }
  if (settings.mongoDb !== undefined) {
    env.MONGO_DB = settings.mongoDb
    config.storage.mongoDb = settings.mongoDb
  }
  
  writeEnvFile(env)
  logger.info({ settings }, 'Настройки хранилища обновлены')
}

/**
 * Парсинг списка символов в формат SymbolConfig
 */
function parseSymbolsList(symbols: string[]): SymbolConfig[] {
  const dataTypes: DataType[] = ['trades', 'kline', 'ticker']
  const intervals = ['1m', '5m', '1h']
  
  return symbols.map(s => s.trim().toUpperCase()).filter(Boolean).map(symbol => ({
    symbol,
    dataTypes,
    intervals
  }))
}
