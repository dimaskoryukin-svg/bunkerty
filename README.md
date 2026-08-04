# Бункер — Next.js для Railway

Полный проект с дизайном игры и комнатами для реальных игроков по коду.

## Загрузка на Railway

Все файлы из этого архива должны находиться в корне репозитория/сервиса. В корне сразу видны:

- `package.json`
- `Dockerfile`
- `railway.json`
- папка `app`

Railway использует `Dockerfile`, собирает Next.js в standalone-режиме и запускает `server.js`.

Для постоянного хранения комнат добавьте Volume, смонтированный в `/data`. В Docker-образе уже задано:

```text
DB_PATH=/data/bunker.sqlite
```

После деплоя откройте **Settings → Networking → Generate Domain**.

## Локальный запуск

```bash
npm install
npm run dev
```

Для production-проверки:

```bash
npm run build
npm start
```

Требуется Node.js 22.5 или новее, поскольку сервер использует встроенный `node:sqlite`.
