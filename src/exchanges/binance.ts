/**
 * Коннектор биржи Binance
 */

import WebSocket from 'ws'
import axios from 'axios'
import { BaseExchangeConnector, type ExchangeConnectorConfig, type MessageHandler } from './base.js'
import type { ExchangeName, SymbolConfig, DataType } from '../config/index.js'
import type { RawMessage } from '../types/index.js'
import { createLogger } from '../utils/logger.js'

const logger = createLogger('binance')

export class BinanceConnector extends BaseExchangeConnector {
  readonly name: ExchangeName = 'binance'
  private restClient: ReturnType<typeof axios.create>

  constructor(config: ExchangeConnectorConfig, market: 'spot' | 'futures', messageHandler?: MessageHandler) {
    super(config, market, messageHandler)
    this.restClient = axios.create({ baseURL: config.restUrl, timeout: 10000 })
  }

  async connect(): Promise<void> {
    const streams = this.buildStreamNames()
    if (streams.length === 0) return
    // URL из конфигурации или по умолчанию
    const baseUrl = this.config.wsUrl || 'wss://stream.binance.com:9443/ws'
    const wsUrl = this.market === 'futures' 
      ? baseUrl.replace('stream.binance.com:9443', 'fstream.binance.com').replace('/ws', '/stream')
      : baseUrl.replace('/ws', '/stream')
    await this.connectWebSocket(`${wsUrl}?streams=${streams.join('/')}`)
  }

  private buildStreamNames(): string[] {
    const streams: string[] = []
    for (const symbolConfig of this.config.symbols) {
      const symbol = symbolConfig.symbol.toLowerCase()
      for (const dataType of symbolConfig.dataTypes) {
        if (dataType === 'trades') streams.push(`${symbol}@aggTrade`)
        else if (dataType === 'kline') for (const i of symbolConfig.intervals || ['1m']) streams.push(`${symbol}@kline_${i}`)
        else if (dataType === 'orderbook') streams.push(`${symbol}@depth${symbolConfig.orderBookDepth || 10}@100ms`)
        else if (dataType === 'ticker') streams.push(`${symbol}@ticker`)
        else if (dataType === 'funding' && this.market === 'futures') streams.push(`${symbol}@markPrice@1s`)
      }
    }
    return streams
  }

  protected handleMessage(data: WebSocket.Data): void {
    try {
      const msg = JSON.parse(data.toString())
      const d = msg.data || msg
      const stream = msg.stream || ''
      let raw: RawMessage | null = null
      
      if (d.e === 'aggTrade' || d.e === 'trade') raw = { _exchange: 'binance', _symbol: d.s, _type: 'trades', _market: this.market, _ingestionTime: Date.now(), ...d }
      else if (d.e === 'kline') raw = { _exchange: 'binance', _symbol: d.s, _type: 'kline', _market: this.market, _ingestionTime: Date.now(), ...d }
      else if (d.e === '24hrTicker') raw = { _exchange: 'binance', _symbol: d.s, _type: 'ticker', _market: this.market, _ingestionTime: Date.now(), ...d }
      else if (d.e === 'depthUpdate' || stream.includes('@depth')) raw = { _exchange: 'binance', _symbol: d.s || stream.split('@')[0].toUpperCase(), _type: 'orderbook', _market: this.market, _ingestionTime: Date.now(), ...d }
      else if (d.e === 'markPriceUpdate') raw = { _exchange: 'binance', _symbol: d.s, _type: 'funding', _market: this.market, _ingestionTime: Date.now(), ...d }
      
      if (raw && this.messageHandler) this.messageHandler(raw)
    } catch (error) {
      logger.error({ error }, 'Ошибка разбора сообщения')
    }
  }

  protected resubscribeAll(): void {
    logger.info('Binance: переподключено, потоки активны')
  }

  async subscribe(s: SymbolConfig): Promise<void> {
    this.subscriptions.set(s.symbol, s)
    this.config.symbols.push(s)
    if (this.ws?.readyState === WebSocket.OPEN) { await this.disconnect(); await this.connect() }
  }

  async unsubscribe(symbol: string): Promise<void> {
    this.subscriptions.delete(symbol)
    this.config.symbols = this.config.symbols.filter(s => s.symbol !== symbol)
    if (this.ws?.readyState === WebSocket.OPEN) { await this.disconnect(); if (this.config.symbols.length > 0) await this.connect() }
  }

  async getAvailableSymbols(): Promise<string[]> {
    try {
      const ep = this.market === 'futures' ? '/fapi/v1/exchangeInfo' : '/api/v3/exchangeInfo'
      const res = await this.restClient.get(ep)
      return res.data.symbols.map((s: any) => s.symbol)
    } catch { return [] }
  }

  async getRecentTrades(symbol: string, limit = 100): Promise<RawMessage[]> {
    try {
      const ep = this.market === 'futures' ? '/fapi/v1/aggTrades' : '/api/v3/aggTrades'
      const res = await this.restClient.get(ep, { params: { symbol, limit } })
      const now = Date.now()
      return res.data.map((t: any) => ({ _exchange: 'binance', _symbol: symbol, _type: 'trades' as DataType, _market: this.market, _ingestionTime: now, ...t }))
    } catch { return [] }
  }

  async getKlines(symbol: string, interval: string, startTime?: number, endTime?: number): Promise<RawMessage[]> {
    try {
      const ep = this.market === 'futures' ? '/fapi/v1/klines' : '/api/v3/klines'
      const params: any = { symbol, interval, limit: 1000 }
      if (startTime) params.startTime = startTime
      if (endTime) params.endTime = endTime
      const res = await this.restClient.get(ep, { params })
      const now = Date.now()
      return res.data.map((k: any[]) => ({ _exchange: 'binance', _symbol: symbol, _type: 'kline' as DataType, _market: this.market, _ingestionTime: now, openTime: k[0], open: k[1], high: k[2], low: k[3], close: k[4], volume: k[5], closeTime: k[6] }))
    } catch { return [] }
  }
}
