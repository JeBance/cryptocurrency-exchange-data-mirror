/**
 * Модуль хранения данных
 * Поддержка файлового хранилища и MongoDB
 */

import { mkdir, appendFile, stat, rename } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { MongoClient, Collection, Document } from 'mongodb'
import type { RawMessage } from '../types/index.js'
import type { StorageConfig, ExchangeName, DataType } from '../config/index.js'
import { createLogger } from '../utils/logger.js'

const logger = createLogger('storage')

export interface IStorage {
  initialize(): Promise<void>
  save(message: RawMessage): void
  flush(): Promise<void>
  close(): Promise<void>
  getStats(): { totalMessages: number; totalBytes: number; writeOperations: number; errors: number }
}

/**
 * Файловое хранилище
 */
export class FileStorage implements IStorage {
  private config: StorageConfig
  private buffers: Map<string, RawMessage[]> = new Map()
  private flushTimer?: ReturnType<typeof setInterval>
  private stats = { totalMessages: 0, totalBytes: 0, writeOperations: 0, errors: 0 }
  private baseDir: string

  constructor(config: StorageConfig) {
    this.config = config
    this.baseDir = config.path || './data'
  }

  async initialize(): Promise<void> {
    if (!existsSync(this.baseDir)) {
      await mkdir(this.baseDir, { recursive: true })
    }

    this.flushTimer = setInterval(() => {
      this.flush().catch(err => {
        logger.error({ err }, 'Ошибка сброса буферов')
        this.stats.errors++
      })
    }, this.config.flushIntervalMs)

    logger.info({ path: this.baseDir }, 'Файловое хранилище инициализировано')
  }

  save(message: RawMessage): void {
    const key = `${message._exchange}_${message._type}_${message._symbol}`
    
    if (!this.buffers.has(key)) {
      this.buffers.set(key, [])
    }
    
    const buffer = this.buffers.get(key)!
    buffer.push(message)
    this.stats.totalMessages++

    if (buffer.length >= this.config.batchSize) {
      this.flushBuffer(key).catch(err => {
        logger.error({ err, key }, 'Ошибка сброса буфера')
        this.stats.errors++
      })
    }
  }

  async flush(): Promise<void> {
    const promises: Promise<void>[] = []
    for (const key of this.buffers.keys()) {
      const buffer = this.buffers.get(key)
      if (buffer && buffer.length > 0) {
        promises.push(this.flushBuffer(key))
      }
    }
    await Promise.all(promises)
  }

  private async flushBuffer(key: string): Promise<void> {
    const buffer = this.buffers.get(key)
    if (!buffer || buffer.length === 0) return

    try {
      const [exchange, dataType, symbol] = key.split('_')
      const now = new Date()
      const dateStr = now.toISOString().split('T')[0]
      
      const dirPath = join(this.baseDir, exchange, dataType, symbol)
      if (!existsSync(dirPath)) {
        await mkdir(dirPath, { recursive: true })
      }

      const filePath = join(dirPath, `${dateStr}.json`)
      await this.rotateIfNeeded(filePath)
      
      const lines = buffer.map(msg => JSON.stringify(msg)).join('\n') + '\n'
      const bytes = Buffer.byteLength(lines, 'utf-8')
      
      await appendFile(filePath, lines, 'utf-8')
      
      this.stats.totalBytes += bytes
      this.stats.writeOperations++
      buffer.length = 0
    } catch (err) {
      this.stats.errors++
      throw err
    }
  }

  private async rotateIfNeeded(filePath: string): Promise<void> {
    if (!existsSync(filePath)) return
    const fileStat = await stat(filePath)
    if (fileStat.size / (1024 * 1024) >= (this.config.maxFileSizeMb || 100)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      await rename(filePath, filePath.replace('.json', `_${timestamp}.json`))
    }
  }

  getStats() { return { ...this.stats } }

  async close(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer)
    await this.flush()
    logger.info('Файловое хранилище закрыто')
  }
}

/**
 * MongoDB хранилище
 */
export class MongoStorage implements IStorage {
  private config: StorageConfig
  private client?: MongoClient
  private collections: Map<string, Collection<Document>> = new Map()
  private buffers: Map<string, RawMessage[]> = new Map()
  private flushTimer?: ReturnType<typeof setInterval>
  private stats = { totalMessages: 0, totalBytes: 0, writeOperations: 0, errors: 0 }

  constructor(config: StorageConfig) {
    this.config = config
  }

  async initialize(): Promise<void> {
    if (!this.config.mongoUrl) throw new Error('MONGO_URL не указан')

    this.client = new MongoClient(this.config.mongoUrl)
    await this.client.connect()

    this.flushTimer = setInterval(() => {
      this.flush().catch(err => {
        logger.error({ err }, 'Ошибка сброса MongoDB буферов')
        this.stats.errors++
      })
    }, this.config.flushIntervalMs)

    logger.info({ url: this.config.mongoUrl }, 'MongoDB хранилище инициализировано')
  }

  private getCollection(exchange: ExchangeName, dataType: DataType, symbol: string): Collection<Document> {
    const name = `raw_${exchange}_${dataType}_${symbol}`.toLowerCase()
    if (!this.collections.has(name)) {
      const db = this.client!.db(this.config.mongoDb)
      const col = db.collection(name)
      col.createIndex({ _ingestionTime: 1 })
      this.collections.set(name, col)
    }
    return this.collections.get(name)!
  }

  save(message: RawMessage): void {
    const key = `${message._exchange}_${message._type}_${message._symbol}`
    if (!this.buffers.has(key)) this.buffers.set(key, [])
    const buffer = this.buffers.get(key)!
    buffer.push(message)
    this.stats.totalMessages++
    if (buffer.length >= this.config.batchSize) {
      this.flushBuffer(key).catch(() => this.stats.errors++)
    }
  }

  async flush(): Promise<void> {
    for (const key of this.buffers.keys()) {
      const buffer = this.buffers.get(key)
      if (buffer && buffer.length > 0) await this.flushBuffer(key)
    }
  }

  private async flushBuffer(key: string): Promise<void> {
    const buffer = this.buffers.get(key)
    if (!buffer || buffer.length === 0) return
    const [exchange, dataType, symbol] = key.split('_')
    const col = this.getCollection(exchange as ExchangeName, dataType as DataType, symbol)
    await col.insertMany(buffer.map(m => ({ ...m })))
    this.stats.writeOperations++
    buffer.length = 0
  }

  getStats() { return { ...this.stats } }

  async close(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer)
    await this.flush()
    if (this.client) await this.client.close()
    logger.info('MongoDB хранилище закрыто')
  }
}

export function createStorage(config: StorageConfig): IStorage {
  return config.type === 'mongodb' ? new MongoStorage(config) : new FileStorage(config)
}
