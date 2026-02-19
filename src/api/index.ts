/**
 * REST API для управления
 */

import express, { type Request, type Response } from 'express'
import { config, type ExchangeName, type DataType, type SymbolConfig } from '../config/index.js'
import type { DataCollector } from '../collectors/index.js'
import { createLogger } from '../utils/logger.js'
import { collectDefaultMetrics, Registry, Gauge } from 'prom-client'

const logger = createLogger('api')

const register = new Registry()
collectDefaultMetrics({ register })

const messagesReceived = new Gauge({ name: 'data_mirror_messages_received_total', help: 'Получено сообщений', labelNames: ['exchange', 'symbol', 'data_type'], registers: [register] })
const messagesStored = new Gauge({ name: 'data_mirror_messages_stored_total', help: 'Сохранено сообщений', labelNames: ['exchange', 'symbol', 'data_type'], registers: [register] })
const connectionStatus = new Gauge({ name: 'data_mirror_connection_status', help: 'Статус подключения', labelNames: ['exchange', 'market'], registers: [register] })
const errors = new Gauge({ name: 'data_mirror_errors_total', help: 'Ошибок', labelNames: ['exchange', 'symbol', 'data_type'], registers: [register] })

export function createApiRouter(collector: DataCollector): express.Router {
  const router = express.Router()

  router.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))

  router.get('/status', (_req, res) => {
    try {
      const s = collector.getStatus()
      res.json({ success: true, data: { uptime: s.uptime, startTime: s.startTime, storage: s.storage, connections: s.connections, stats: s.stats } })
    } catch (error) { res.status(500).json({ success: false, error: 'Ошибка сервера' }) }
  })

  router.get('/exchanges', (_req, res) => {
    const s = collector.getStatus()
    const exchanges = new Map<string, any>()
    for (const c of s.connections) {
      if (!exchanges.has(c.exchange)) exchanges.set(c.exchange, { name: c.exchange, markets: [], connected: false })
      const e = exchanges.get(c.exchange)!
      e.markets.push({ market: c.market, connected: c.connected })
      if (c.connected) e.connected = true
    }
    res.json({ success: true, data: Array.from(exchanges.values()) })
  })

  router.get('/symbols', (req, res) => {
    const s = collector.getStatus()
    let stats = s.stats
    if (req.query.exchange) stats = stats.filter(x => x.exchange === req.query.exchange)
    const symbols = new Map<string, any>()
    for (const st of stats) {
      const key = `${st.exchange}_${st.symbol}`
      if (!symbols.has(key)) symbols.set(key, { exchange: st.exchange, symbol: st.symbol, dataTypes: [], messagesReceived: 0, messagesStored: 0, errors: 0 })
      const sym = symbols.get(key)!
      sym.dataTypes.push(st.dataType)
      sym.messagesReceived += st.messagesReceived
      sym.messagesStored += st.messagesStored
      sym.errors += st.errors
    }
    res.json({ success: true, data: Array.from(symbols.values()) })
  })

  router.post('/symbols', async (req, res) => {
    try {
      const { exchange, symbols, dataTypes, intervals } = req.body
      if (!exchange || !symbols || !dataTypes) { res.status(400).json({ success: false, error: 'Укажите exchange, symbols, dataTypes' }); return }
      for (const sym of symbols) await collector.addSymbol(exchange, { symbol: sym.toUpperCase(), dataTypes, intervals })
      res.json({ success: true, message: `Добавлено ${symbols.length} символ(ов)` })
    } catch (error) { res.status(500).json({ success: false, error: 'Ошибка добавления' }) }
  })

  router.delete('/symbols/:exchange/:symbol', async (req, res) => {
    try {
      await collector.removeSymbol(req.params.exchange as ExchangeName, req.params.symbol.toUpperCase())
      res.json({ success: true, message: `Удалён ${req.params.symbol}` })
    } catch (error) { res.status(500).json({ success: false, error: 'Ошибка удаления' }) }
  })

  router.get('/available-symbols/:exchange', async (req, res) => {
    try { res.json({ success: true, data: await collector.getAvailableSymbols(req.params.exchange as ExchangeName) }) }
    catch { res.status(500).json({ success: false, error: 'Ошибка получения символов' }) }
  })

  router.post('/backfill', async (req, res) => {
    const { exchange, symbol, dataType, interval, startTime, endTime } = req.body
    if (!exchange || !symbol || !dataType) { res.status(400).json({ success: false, error: 'Укажите exchange, symbol, dataType' }); return }
    collector.backfill(exchange, symbol, dataType, { interval, startTime, endTime }).catch(err => logger.error({ err }, 'Backfill не удался'))
    res.json({ success: true, message: `Backfill запущен для ${symbol}` })
  })

  router.get('/metrics', async (_req, res) => {
    try {
      const s = collector.getStatus()
      for (const c of s.connections) connectionStatus.set({ exchange: c.exchange, market: c.market }, c.connected ? 1 : 0)
      for (const st of s.stats) {
        messagesReceived.set({ exchange: st.exchange, symbol: st.symbol, data_type: st.dataType }, st.messagesReceived)
        messagesStored.set({ exchange: st.exchange, symbol: st.symbol, data_type: st.dataType }, st.messagesStored)
        errors.set({ exchange: st.exchange, symbol: st.symbol, data_type: st.dataType }, st.errors)
      }
      res.set('Content-Type', register.contentType)
      res.send(await register.metrics())
    } catch { res.status(500).send('Ошибка генерации метрик') }
  })

  return router
}

export function updateMetrics(collector: DataCollector): void {
  const s = collector.getStatus()
  for (const c of s.connections) connectionStatus.set({ exchange: c.exchange, market: c.market }, c.connected ? 1 : 0)
}
