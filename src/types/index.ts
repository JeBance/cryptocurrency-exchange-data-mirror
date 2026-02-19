/**
 * Типы данных для сырых сообщений бирж
 */

import type { ExchangeName, DataType } from '../config/index.js'

export interface RawMessage {
  _exchange: ExchangeName
  _symbol: string
  _type: DataType
  _ingestionTime: number
  _market?: string
  [key: string]: any
}

export interface ConnectionStatus {
  exchange: ExchangeName
  market: string
  connected: boolean
  lastConnected?: Date
  lastDisconnected?: Date
  reconnectAttempts: number
  error?: string
}

export interface CollectionStats {
  exchange: ExchangeName
  symbol: string
  dataType: DataType
  messagesReceived: number
  messagesStored: number
  lastMessageTime?: Date
  errors: number
}

export interface StorageStatus {
  type: 'file' | 'mongodb'
  path?: string
  mongoUrl?: string
  mongoDb?: string
}

export interface ServiceStatus {
  uptime: number
  startTime: Date
  connections: ConnectionStatus[]
  stats: CollectionStats[]
  storage: StorageStatus
}
