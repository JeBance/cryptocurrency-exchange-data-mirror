/**
 * Модуль сбора данных
 */

import { config, type ExchangeName, type SymbolConfig, type DataType } from '../config/index.js'
import { createStorage, type IStorage } from '../storage/index.js'
import { BinanceConnector } from '../exchanges/binance.js'
import { BybitConnector } from '../exchanges/bybit.js'
import type { ExchangeConnector } from '../exchanges/base.js'
import type { RawMessage, ServiceStatus, ConnectionStatus, CollectionStats } from '../types/index.js'
import { createLogger } from '../utils/logger.js'

const logger = createLogger('collector')

export class DataCollector {
  private storage: IStorage
  private connectors: Map<string, ExchangeConnector> = new Map()
  private stats: Map<string, CollectionStats> = new Map()
  private startTime: Date
  private isRunning = false

  constructor() {
    this.storage = createStorage(config.storage)
    this.startTime = new Date()
  }

  async start(): Promise<void> {
    if (this.isRunning) return
    logger.info('Запуск сборщика данных...')
    this.isRunning = true

    await this.storage.initialize()
    const handler = (msg: RawMessage) => this.handleMessage(msg)

    // Binance
    if (config.exchanges.binance.enabled) {
      for (const market of config.exchanges.binance.markets) {
        const c = new BinanceConnector({ wsUrl: config.exchanges.binance.wsUrl || '', restUrl: config.exchanges.binance.restUrl || '', symbols: config.exchanges.binance.symbols, reconnect: config.reconnect }, market as 'spot' | 'futures', handler)
        this.connectors.set(`binance_${market}`, c)
        for (const s of config.exchanges.binance.symbols) for (const dt of s.dataTypes) this.initStats('binance', s.symbol, dt)
      }
    }

    // Bybit
    if (config.exchanges.bybit.enabled) {
      for (const market of config.exchanges.bybit.markets) {
        const c = new BybitConnector({ wsUrl: config.exchanges.bybit.wsUrl || '', restUrl: config.exchanges.bybit.restUrl || '', symbols: config.exchanges.bybit.symbols, reconnect: config.reconnect }, market === 'derivatives' ? 'derivatives' : 'spot', handler)
        this.connectors.set(`bybit_${market}`, c)
        for (const s of config.exchanges.bybit.symbols) for (const dt of s.dataTypes) this.initStats('bybit', s.symbol, dt)
      }
    }

    for (const [key, c] of this.connectors) {
      logger.info({ key }, 'Подключение к бирже')
      c.connect().catch(err => logger.error({ err, key }, 'Ошибка подключения'))
    }
    logger.info('Сборщик данных запущен')
  }

  private initStats(exchange: ExchangeName, symbol: string, dataType: DataType): void {
    const key = `${exchange}_${symbol}_${dataType}`
    this.stats.set(key, { exchange, symbol, dataType, messagesReceived: 0, messagesStored: 0, errors: 0 })
  }

  private handleMessage(msg: RawMessage): void {
    const key = `${msg._exchange}_${msg._symbol}_${msg._type}`
    const stats = this.stats.get(key)
    if (stats) { stats.messagesReceived++; stats.lastMessageTime = new Date() }
    try {
      this.storage.save(msg)
      if (stats) stats.messagesStored++
    } catch (error) {
      logger.error({ error }, 'Ошибка сохранения')
      if (stats) stats.errors++
    }
  }

  async stop(): Promise<void> {
    logger.info('Остановка сборщика...')
    this.isRunning = false
    for (const [key, c] of this.connectors) {
      logger.info({ key }, 'Отключение от биржи')
      await c.disconnect()
    }
    await this.storage.close()
    this.connectors.clear()
    logger.info('Сборщик остановлен')
  }

  async addSymbol(exchange: ExchangeName, s: SymbolConfig): Promise<void> {
    for (const [key, c] of this.connectors) if (key.startsWith(exchange)) { await c.subscribe(s); for (const dt of s.dataTypes) this.initStats(exchange, s.symbol, dt) }
  }

  async removeSymbol(exchange: ExchangeName, symbol: string): Promise<void> {
    for (const [key, c] of this.connectors) if (key.startsWith(exchange)) await c.unsubscribe(symbol)
    for (const [k] of this.stats) if (k.startsWith(`${exchange}_${symbol}`)) this.stats.delete(k)
  }

  async getAvailableSymbols(exchange: ExchangeName): Promise<string[]> {
    const c = Array.from(this.connectors.values()).find(c => c.name === exchange)
    return c ? c.getAvailableSymbols() : []
  }

  async backfill(exchange: ExchangeName, symbol: string, dataType: DataType, opts?: { interval?: string; startTime?: number; endTime?: number }): Promise<void> {
    const c = Array.from(this.connectors.values()).find(c => c.name === exchange)
    if (!c) throw new Error(`Нет коннектора для ${exchange}`)
    logger.info({ exchange, symbol, dataType, opts }, 'Запуск backfill')
    const msgs = dataType === 'trades' ? await c.getRecentTrades(symbol, 1000) : dataType === 'kline' && opts?.interval ? await c.getKlines(symbol, opts.interval, opts.startTime, opts.endTime) : []
    for (const m of msgs) this.storage.save(m)
    await this.storage.flush()
    logger.info({ exchange, symbol, count: msgs.length }, 'Backfill завершён')
  }

  getStatus(): ServiceStatus {
    return {
      uptime: Date.now() - this.startTime.getTime(),
      startTime: this.startTime,
      connections: Array.from(this.connectors.values()).map(c => c.getStatus()),
      stats: Array.from(this.stats.values()),
      storage: {
        type: config.storage.type,
        path: config.storage.path,
        mongoUrl: config.storage.mongoUrl,
        mongoDb: config.storage.mongoDb
      }
    }
  }
}
