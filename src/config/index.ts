/**
 * Модуль конфигурации для Data Mirror
 * Загружает настройки из переменных окружения
 */

import { config as dotenvConfig } from 'dotenv'

dotenvConfig()

export type ExchangeName = 'binance' | 'bybit'
export type MarketType = 'spot' | 'futures' | 'derivatives'
export type DataType = 'trades' | 'kline' | 'orderbook' | 'ticker' | 'funding'

export interface SymbolConfig {
  symbol: string
  dataTypes: DataType[]
  intervals?: string[]
  orderBookDepth?: number
}

export interface ExchangeConfig {
  enabled: boolean
  markets: MarketType[]
  symbols: SymbolConfig[]
  wsUrl?: string
  restUrl?: string
}

export interface StorageConfig {
  type: 'file' | 'mongodb'
  path?: string
  mongoUrl?: string
  mongoDb?: string
  batchSize: number
  flushIntervalMs: number
  maxFileSizeMb: number
}

export interface AppConfig {
  port: number
  exchanges: {
    binance: ExchangeConfig
    bybit: ExchangeConfig
  }
  storage: StorageConfig
  logging: {
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
    pretty: boolean
  }
  reconnect: {
    maxRetries: number
    baseDelayMs: number
    maxDelayMs: number
  }
}

// Конфигурация по умолчанию
const defaultConfig: AppConfig = {
  port: parseInt(process.env.PORT || '3030', 10),
  exchanges: {
    binance: {
      enabled: process.env.BINANCE_ENABLED !== 'false',
      markets: (process.env.BINANCE_MARKETS || 'spot').split(',') as MarketType[],
      symbols: parseSymbols(process.env.BINANCE_SYMBOLS || 'BTCUSDT,ETHUSDT'),
      wsUrl: process.env.BINANCE_WS_URL || 'wss://stream.binance.com:9443/ws',
      restUrl: process.env.BINANCE_REST_URL || 'https://api.binance.com'
    },
    bybit: {
      enabled: process.env.BYBIT_ENABLED !== 'false',
      markets: (process.env.BYBIT_MARKETS || 'spot').split(',') as MarketType[],
      symbols: parseSymbols(process.env.BYBIT_SYMBOLS || 'BTCUSDT,ETHUSDT'),
      wsUrl: process.env.BYBIT_WS_URL || 'wss://stream.bybit.com/v5/public/spot',
      restUrl: process.env.BYBIT_REST_URL || 'https://api.bybit.com'
    }
  },
  storage: {
    type: (process.env.STORAGE_TYPE as 'file' | 'mongodb') || 'file',
    path: process.env.STORAGE_PATH || './data',
    mongoUrl: process.env.MONGO_URL,
    mongoDb: process.env.MONGO_DB || 'data_mirror',
    batchSize: parseInt(process.env.BATCH_SIZE || '1000', 10),
    flushIntervalMs: parseInt(process.env.FLUSH_INTERVAL_MS || '5000', 10),
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '100', 10)
  },
  logging: {
    level: (process.env.LOG_LEVEL as AppConfig['logging']['level']) || 'info',
    pretty: process.env.LOG_PRETTY !== 'false'
  },
  reconnect: {
    maxRetries: parseInt(process.env.RECONNECT_MAX_RETRIES || '10', 10),
    baseDelayMs: parseInt(process.env.RECONNECT_BASE_DELAY_MS || '1000', 10),
    maxDelayMs: parseInt(process.env.RECONNECT_MAX_DELAY_MS || '60000', 10)
  }
}

function parseSymbols(symbolsStr: string): SymbolConfig[] {
  const dataTypes: DataType[] = ['trades', 'kline', 'ticker']
  const intervals = ['1m', '5m', '1h']
  
  return symbolsStr.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).map(symbol => ({
    symbol,
    dataTypes,
    intervals
  }))
}

export function loadConfig(): AppConfig {
  const envConfig: Partial<AppConfig> = {}
  
  if (process.env.PORT) {
    envConfig.port = parseInt(process.env.PORT, 10)
  }
  
  if (process.env.STORAGE_TYPE === 'mongodb' && !process.env.MONGO_URL) {
    throw new Error('MONGO_URL обязателен когда STORAGE_TYPE=mongodb')
  }
  
  return { ...defaultConfig, ...envConfig }
}

export const config = loadConfig()
