/**
 * Коннектор биржи Bybit
 */

import WebSocket from 'ws'
import axios from 'axios'
import { BaseExchangeConnector, type ExchangeConnectorConfig, type MessageHandler } from './base.js'
import type { ExchangeName, SymbolConfig, DataType } from '../config/index.js'
import type { RawMessage } from '../types/index.js'
import { createLogger } from '../utils/logger.js'

const logger = createLogger('bybit')

export class BybitConnector extends BaseExchangeConnector {
  readonly name: ExchangeName = 'bybit'
  private restClient: ReturnType<typeof axios.create>
  private pingInterval?: ReturnType<typeof setInterval>

  constructor(config: ExchangeConnectorConfig, market: 'spot' | 'derivatives', messageHandler?: MessageHandler) {
    super(config, market, messageHandler)
    this.restClient = axios.create({ baseURL: config.restUrl, timeout: 10000 })
  }

  async connect(): Promise<void> {
    // URL из конфигурации или по умолчанию
    const baseUrl = this.config.wsUrl || 'wss://stream.bybit.com/v5/public/spot'
    const wsUrl = this.market === 'derivatives' 
      ? baseUrl.replace('/spot', '/linear')
      : baseUrl
    await this.connectWebSocket(wsUrl)
  }

  protected handleMessage(data: WebSocket.Data): void {
    try {
      const msg = JSON.parse(data.toString())
      if (msg.op === 'pong' || msg.ret_msg === 'pong') return
      if (msg.op === 'subscribe' || msg.success !== undefined) {
        if (msg.success === false) logger.warn({ msg }, 'Bybit: ошибка подписки')
        return
      }

      const topic = msg.topic || ''
      let raw: RawMessage | null = null

      if (topic.includes('publicTrade')) {
        const symbol = topic.split('.')[1] || msg.data?.[0]?.s
        raw = { _exchange: 'bybit', _symbol: symbol, _type: 'trades', _market: this.market, _ingestionTime: Date.now(), ...msg }
      } else if (topic.includes('kline')) {
        const symbol = topic.split('.')[2] || ''
        raw = { _exchange: 'bybit', _symbol: symbol, _type: 'kline', _market: this.market, _ingestionTime: Date.now(), ...msg }
      } else if (topic.includes('tickers')) {
        const symbol = msg.data?.symbol || topic.split('.')[1]
        raw = { _exchange: 'bybit', _symbol: symbol, _type: 'ticker', _market: this.market, _ingestionTime: Date.now(), ...msg }
      } else if (topic.includes('orderbook')) {
        const symbol = msg.data?.s || topic.split('.')[1]
        raw = { _exchange: 'bybit', _symbol: symbol, _type: 'orderbook', _market: this.market, _ingestionTime: Date.now(), ...msg }
      }

      if (raw && this.messageHandler) this.messageHandler(raw)
    } catch (error) {
      logger.error({ error }, 'Ошибка разбора сообщения')
    }
  }

  protected resubscribeAll(): void {
    logger.info('Bybit: WebSocket подключён, подписка на символы...')
    for (const s of this.config.symbols) this.sendSubscription(s)
    this.startPingInterval()
  }

  private sendSubscription(s: SymbolConfig): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    const args: string[] = []
    for (const dt of s.dataTypes) {
      if (dt === 'trades') args.push(`publicTrade.${s.symbol}`)
      else if (dt === 'kline') for (const i of s.intervals || ['1']) args.push(`kline.${this.convertInterval(i)}.${s.symbol}`)
      else if (dt === 'orderbook') args.push(`orderbook.${s.orderBookDepth || 50}.${s.symbol}`)
      else if (dt === 'ticker') args.push(`tickers.${s.symbol}`)
    }
    if (args.length > 0) {
      this.ws.send(JSON.stringify({ op: 'subscribe', args }))
      logger.info({ symbol: s.symbol, args }, 'Bybit: отправлена подписка')
    }
  }

  private convertInterval(i: string): string {
    const map: Record<string, string> = { '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '2h': '120', '4h': '240', '1d': 'D', '1w': 'W' }
    return map[i] || i
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ op: 'ping' }))
    }, 20000)
  }

  async subscribe(s: SymbolConfig): Promise<void> {
    this.subscriptions.set(s.symbol, s)
    this.config.symbols.push(s)
    if (this.ws?.readyState === WebSocket.OPEN) this.sendSubscription(s)
  }

  async unsubscribe(symbol: string): Promise<void> {
    this.subscriptions.delete(symbol)
    this.config.symbols = this.config.symbols.filter(s => s.symbol !== symbol)
  }

  async getAvailableSymbols(): Promise<string[]> {
    try {
      const cat = this.market === 'derivatives' ? 'linear' : 'spot'
      const res = await this.restClient.get('/v5/market/instruments-info', { params: { category: cat } })
      return res.data.retCode === 0 ? res.data.result.list.map((s: any) => s.symbol) : []
    } catch { return [] }
  }

  async getRecentTrades(symbol: string, limit = 100): Promise<RawMessage[]> {
    try {
      const cat = this.market === 'derivatives' ? 'linear' : 'spot'
      const res = await this.restClient.get('/v5/market/recent-trade', { params: { category: cat, symbol, limit } })
      if (res.data.retCode !== 0) return []
      const now = Date.now()
      return res.data.result.list.map((t: any) => ({ _exchange: 'bybit', _symbol: symbol, _type: 'trades' as DataType, _market: this.market, _ingestionTime: now, ...t }))
    } catch { return [] }
  }

  async getKlines(symbol: string, interval: string, startTime?: number, endTime?: number): Promise<RawMessage[]> {
    try {
      const cat = this.market === 'derivatives' ? 'linear' : 'spot'
      const params: any = { category: cat, symbol, interval: this.convertInterval(interval), limit: 200 }
      if (startTime) params.start = startTime
      if (endTime) params.end = endTime
      const res = await this.restClient.get('/v5/market/kline', { params })
      if (res.data.retCode !== 0) return []
      const now = Date.now()
      return res.data.result.list.map((k: any[]) => ({ _exchange: 'bybit', _symbol: symbol, _type: 'kline' as DataType, _market: this.market, _ingestionTime: now, startTime: k[0], open: k[1], high: k[2], low: k[3], close: k[4], volume: k[5] }))
    } catch { return [] }
  }

  async disconnect(): Promise<void> {
    if (this.pingInterval) clearInterval(this.pingInterval)
    await super.disconnect()
  }
}
