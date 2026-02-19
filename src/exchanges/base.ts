/**
 * Базовый класс коннектора биржи
 */

import WebSocket from 'ws'
import type { ExchangeName, DataType, SymbolConfig } from '../config/index.js'
import type { RawMessage, ConnectionStatus } from '../types/index.js'
import { createLogger } from '../utils/logger.js'

const logger = createLogger('exchange')

export type MessageHandler = (message: RawMessage) => void

export interface ExchangeConnector {
  readonly name: ExchangeName
  connect(): Promise<void>
  disconnect(): Promise<void>
  subscribe(symbol: SymbolConfig): Promise<void>
  unsubscribe(symbol: string): Promise<void>
  getStatus(): ConnectionStatus
  getAvailableSymbols(): Promise<string[]>
  getRecentTrades(symbol: string, limit?: number): Promise<RawMessage[]>
  getKlines(symbol: string, interval: string, startTime?: number, endTime?: number): Promise<RawMessage[]>
}

export interface ExchangeConnectorConfig {
  wsUrl: string
  restUrl: string
  symbols: SymbolConfig[]
  reconnect: { maxRetries: number; baseDelayMs: number; maxDelayMs: number }
}

export abstract class BaseExchangeConnector implements ExchangeConnector {
  abstract readonly name: ExchangeName
  protected config: ExchangeConnectorConfig
  protected ws?: WebSocket
  protected status: ConnectionStatus
  protected messageHandler?: MessageHandler
  protected subscriptions: Map<string, SymbolConfig> = new Map()
  protected reconnectAttempts = 0
  protected reconnectTimer?: ReturnType<typeof setTimeout>
  protected isConnecting = false
  protected market: string

  constructor(config: ExchangeConnectorConfig, market: string, messageHandler?: MessageHandler) {
    this.config = config
    this.market = market
    this.messageHandler = messageHandler
    this.status = { exchange: 'binance' as ExchangeName, market: this.market, connected: false, reconnectAttempts: 0 }
  }

  abstract connect(): Promise<void>
  abstract subscribe(symbol: SymbolConfig): Promise<void>
  abstract unsubscribe(symbol: string): Promise<void>
  abstract getAvailableSymbols(): Promise<string[]>
  abstract getRecentTrades(symbol: string, limit?: number): Promise<RawMessage[]>
  abstract getKlines(symbol: string, interval: string, startTime?: number, endTime?: number): Promise<RawMessage[]>
  protected abstract handleMessage(data: WebSocket.Data): void
  protected abstract resubscribeAll(): void

  setMessageHandler(handler: MessageHandler): void { this.messageHandler = handler }
  
  getStatus(): ConnectionStatus {
    this.status.exchange = this.name
    return { ...this.status }
  }

  protected async connectWebSocket(url: string): Promise<void> {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) return
    this.isConnecting = true

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url)

        this.ws.on('open', () => {
          this.isConnecting = false
          this.reconnectAttempts = 0
          this.status.connected = true
          this.status.lastConnected = new Date()
          this.status.error = undefined
          this.resubscribeAll()
          resolve()
        })

        this.ws.on('message', (data) => this.handleMessage(data))
        this.ws.on('error', (error) => { this.status.error = error.message; this.isConnecting = false; reject(error) })
        this.ws.on('close', () => {
          this.status.connected = false
          this.status.lastDisconnected = new Date()
          this.isConnecting = false
          this.scheduleReconnect()
        })
      } catch (error) {
        this.isConnecting = false
        reject(error)
      }
    })
  }

  protected scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.reconnect.maxRetries) {
      this.status.error = 'Достигнут максимум попыток переподключения'
      return
    }
    const delay = Math.min(this.config.reconnect.baseDelayMs * Math.pow(2, this.reconnectAttempts), this.config.reconnect.maxDelayMs)
    this.reconnectAttempts++
    this.status.reconnectAttempts = this.reconnectAttempts
    logger.info({ exchange: this.name, attempt: this.reconnectAttempts, delay }, 'Планирование переподключения')
    this.reconnectTimer = setTimeout(() => this.connect().catch(err => logger.error({ err }, 'Переподключение не удалось')), delay)
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.ws) { this.ws.close(); this.ws = undefined }
    this.status.connected = false
  }
}
