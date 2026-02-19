# Cryptocurrency Exchange Data Mirror

<div align="center">

[![npm version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/JeBance/cryptocurrency-exchange-data-mirror)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)

**Высокопроизводительный микросервис для сбора рыночных данных с бирж Binance и Bybit**

[Возможности](#возможности) • [Установка](#установка) • [Конфигурация](#конфигурация) • [API](#rest-api) • [Документация](#документация)

</div>

---

## Описание

**Cryptocurrency Exchange Data Mirror** — это микросервис для непрерывного сбора публичных рыночных данных с криптовалютных бирж **Binance** и **Bybit** в реальном времени. Все данные сохраняются в исходном JSON-формате без обработки, что делает их идеальными для:

- 📊 Бэктестинга торговых стратегий
- 🤖 Машинного обучения и анализа данных  
- 📈 Мониторинга рынка в реальном времени
- 🔄 Восстановления истории при сбоях

---

## Возможности

### Поддерживаемые биржи

| Биржа | Spot | Futures/Derivatives | Статус |
|-------|------|---------------------|--------|
| Binance | ✅ | ✅ | Полная поддержка |
| Bybit | ✅ | ✅ | Полная поддержка |

### Типы собираемых данных

| Тип | Описание | Binance | Bybit |
|-----|----------|---------|-------|
| `trades` | Сделки (цена, объём, направление) | ✅ | ✅ |
| `kline` | Свечи (OHLCV) | ✅ | ✅ |
| `ticker` | 24-часовая статистика | ✅ | ✅ |
| `orderbook` | Стакан ордеров | ✅ | ✅ |
| `funding` | Ставка фондирования | ✅ | ✅ |

### Ключевые особенности

- 🚀 **Высокая производительность** — тысячи сообщений в секунду
- 🔄 **Автоматическое переподключение** — экспоненциальная задержка
- 💾 **Гибкое хранение** — файлы или MongoDB с буферизацией
- 📊 **Мониторинг** — Prometheus метрики и REST API
- 🎛️ **Динамическое управление** — добавление символов без перезапуска
- ⚙️ **Полная конфигурация** — все URL и пути через переменные окружения
- 🔐 **Защита API ключом** — генерация ключа при каждом запуске

---

## 🔐 Безопасность

### API Ключ

При каждом запуске микросервис генерирует уникальный API ключ, который отображается в консоли:

```
╔════════════════════════════════════════════════════════════════╗
║                    DATA MIRROR ЗАПУЩЕН                         ║
╠════════════════════════════════════════════════════════════════╣
║  🔑 API КЛЮЧ (сохраните его!):                                  ║
║                                                                  ║
║  f997bb43c077463292bc68d3ccf17dd1ee79fd5df43e157579ac990cc0aed67c║
╚════════════════════════════════════════════════════════════════╝
```

### Использование ключа

Все запросы к API (кроме `/health`) требуют передачи ключа в заголовке `X-API-Key`:

```bash
# Без ключа — ошибка 401
curl http://localhost:3030/api/v1/status
# {"success":false,"error":"Требуется API ключ. Передайте заголовок X-API-Key"}

# С ключом — успешный запрос
curl -H "X-API-Key: YOUR_API_KEY" http://localhost:3030/api/v1/status
```

### Постоянный ключ

Для использования постоянного ключа задайте переменную `API_KEY`:

```bash
# Через .env файл
API_KEY=your-secret-key-here

# Или через командную строку
API_KEY=my-secret-key npm start
```

---

## Установка

### Требования

- **Node.js** 18+ (или Bun)
- **MongoDB** (опционально)

### С помощью npm

```bash
# Клонирование репозитория
git clone https://github.com/JeBance/cryptocurrency-exchange-data-mirror.git
cd cryptocurrency-exchange-data-mirror

# Установка зависимостей
npm install

# Запуск в production режиме
npm start

# Запуск в режиме разработки (с автообновлением)
npm run dev
```

### С помощью Bun

```bash
# Установка зависимостей
bun install

# Запуск
bun run dev
```

### Доступные команды

| Команда | Описание |
|---------|----------|
| `npm start` | Запуск в production режиме |
| `npm run dev` | Режим разработки (автообновление) |
| `npm run build` | Компиляция TypeScript в JavaScript |
| `npm run lint` | Проверка кода |

---

## Конфигурация

Все параметры настраиваются через переменные окружения:

### Основные настройки

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `PORT` | `3030` | Порт сервиса |
| `LOG_LEVEL` | `info` | Уровень логирования |

### Хранилище

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `STORAGE_TYPE` | `file` | Тип хранилища (`file` / `mongodb`) |
| `STORAGE_PATH` | `./data` | Путь для файлового хранилища |
| `MONGO_URL` | — | URL подключения к MongoDB |
| `MONGO_DB` | `data_mirror` | Имя базы данных |
| `BATCH_SIZE` | `1000` | Размер пачки для буферизированной записи |

### Binance

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `BINANCE_ENABLED` | `true` | Включить Binance |
| `BINANCE_MARKETS` | `spot` | Рынки (spot,futures) |
| `BINANCE_SYMBOLS` | `BTCUSDT,ETHUSDT` | Символы через запятую |
| `BINANCE_WS_URL` | `wss://stream.binance.com:9443/ws` | WebSocket URL |
| `BINANCE_REST_URL` | `https://api.binance.com` | REST API URL |

### Bybit

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `BYBIT_ENABLED` | `true` | Включить Bybit |
| `BYBIT_MARKETS` | `spot` | Рынки (spot,derivatives) |
| `BYBIT_SYMBOLS` | `BTCUSDT,ETHUSDT` | Символы через запятую |
| `BYBIT_WS_URL` | `wss://stream.bybit.com/v5/public/spot` | WebSocket URL |
| `BYBIT_REST_URL` | `https://api.bybit.com` | REST API URL |

### Пример .env файла

```bash
# Основные
PORT=3030
LOG_LEVEL=info

# Хранилище
STORAGE_TYPE=file
STORAGE_PATH=/var/data/crypto

# Binance
BINANCE_ENABLED=true
BINANCE_MARKETS=spot,futures
BINANCE_SYMBOLS=BTCUSDT,ETHUSDT,SOLUSDT

# Bybit
BYBIT_ENABLED=true
BYBIT_MARKETS=spot
BYBIT_SYMBOLS=BTCUSDT,ETHUSDT
```

---

## REST API

### Базовый путь: `/api/v1`

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/health` | Проверка работоспособности |
| GET | `/status` | Полный статус сервиса |
| GET | `/exchanges` | Список подключённых бирж |
| GET | `/symbols` | Отслеживаемые символы |
| POST | `/symbols` | Добавить символ |
| DELETE | `/symbols/:exchange/:symbol` | Удалить символ |
| GET | `/available-symbols/:exchange` | Доступные символы биржи |
| POST | `/backfill` | Запрос исторических данных |
| GET | `/metrics` | Prometheus метрики |

### Примеры запросов

```bash
# Проверка здоровья (без ключа)
curl http://localhost:3030/api/v1/health

# Статус (требуется ключ)
curl -H "X-API-Key: YOUR_API_KEY" http://localhost:3030/api/v1/status

# Добавить символ
curl -X POST http://localhost:3030/api/v1/symbols \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"exchange":"binance","symbols":["SOLUSDT"],"dataTypes":["trades","ticker"]}'

# Удалить символ
curl -X DELETE \
  -H "X-API-Key: YOUR_API_KEY" \
  http://localhost:3030/api/v1/symbols/binance/SOLUSDT

# Backfill исторических данных
curl -X POST http://localhost:3030/api/v1/backfill \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"exchange":"binance","symbol":"BTCUSDT","dataType":"kline","interval":"1m"}'
```

---

## Формат данных

Данные сохраняются в RAW JSON с enriched-полями:

```json
{
  "_exchange": "binance",
  "_symbol": "BTCUSDT",
  "_type": "trades",
  "_market": "spot",
  "_ingestionTime": 1705312800000,
  "e": "aggTrade",
  "E": 1705312799000,
  "s": "BTCUSDT",
  "p": "42000.50",
  "q": "0.15",
  "T": 1705312798999,
  "m": false
}
```

**Служебные поля:**
- `_exchange` — биржа (binance/bybit)
- `_symbol` — торговая пара
- `_type` — тип данных
- `_market` — рынок (spot/futures)
- `_ingestionTime` — время получения (мс)

---

## Структура проекта

```
src/
├── index.ts           # Точка входа
├── config/
│   └── index.ts       # Конфигурация
├── exchanges/
│   ├── base.ts        # Базовый коннектор
│   ├── binance.ts     # Binance WebSocket
│   └── bybit.ts       # Bybit WebSocket
├── storage/
│   └── index.ts       # File & MongoDB хранилища
├── collectors/
│   └── index.ts       # Сборщик данных
├── api/
│   └── index.ts       # REST API + Prometheus
├── types/
│   └── index.ts       # TypeScript типы
└── utils/
    └── logger.ts      # Логирование (Pino)
```

---

## Prometheus метрики

| Метрика | Тип | Описание |
|---------|-----|----------|
| `data_mirror_messages_received_total` | Gauge | Получено сообщений |
| `data_mirror_messages_stored_total` | Gauge | Сохранено сообщений |
| `data_mirror_connection_status` | Gauge | Статус подключения (1/0) |
| `data_mirror_errors_total` | Gauge | Количество ошибок |

---

## Разработка

```bash
# Режим разработки с автоперезагрузкой
bun run dev

# Проверка кода
bun run lint
```

---

## Лицензия

[MIT](LICENSE)

---

## Автор

**JeBance**

- GitHub: [@JeBance](https://github.com/JeBance)
- Репозиторий: [cryptocurrency-exchange-data-mirror](https://github.com/JeBance/cryptocurrency-exchange-data-mirror)

---

<div align="center">

**⭐ Если проект был полезен, поставьте звезду! ⭐**

</div>
