# Architecture

## Overview

```
Browser (React SPA)
  │  fetch /api/*  ── X-Request-Id ──┐
  ▼                                  │
Express (src/server/index.ts)        │
  ├─ requestContext   (AsyncLocalStorage: requestId)
  ├─ accessLog        (/api only)
  ├─ routes/          spaces · pages · backup · attachments
  │    └─ sendError() → { code, message, details, requestId }
  ├─ services/
  │    ├─ confluenceClient.ts   Confluence Cloud REST v2/v1 (axios, retry)
  │    ├─ parser.ts             storage format → HTML / Markdown / PDF
  │    ├─ browser.ts            Chrome resolution + launch for PDF
  │    └─ treeBuilder.ts        page hierarchy
  └─ utils/
       ├─ logger.ts             root winston logger + child per module
       ├─ requestContext.ts     request id propagation
       └─ errors.ts             AppError / ErrorCode / sendError
```

## Request flow: backup download

1. `POST /api/backup/download` → `routes/backup.ts`
2. `confluenceClient.getPagesFromSpace()` (5 min cache)
3. `parser.convertPages()` writes into a temp dir
   - PDF selected → `browser.launchPdfBrowser()`
     - `PUPPETEER_EXECUTABLE_PATH` → bundled Chrome → system Chrome
     - none → `AppError(PDF_BROWSER_NOT_FOUND, 503)`
4. `archiver.ZipArchive` → streamed response, temp files removed
5. Failure → `sendError()`; client `localizeError()` renders ko/en text with request id

## Error contract

| Layer | Responsibility |
|-------|----------------|
| `utils/errors.ts` | Stable `code` for conditions the user can act on |
| routes | Log with context, delegate to `sendError()` |
| `client/services/api.ts` | `ApiError` keeps `status/code/details/requestId` |
| `client/i18n/errorMessages.ts` | `code` → message by `navigator.languages`; unknown codes fall back to server `message` |

## Logging

Single root logger, console (12-factor stream) + JSON Lines files in the OS-standard state/log directory, size rotation. Details: [docs/technical.md#로깅](docs/technical.md#로깅).

## Runtime / build

| Item | Value |
|------|-------|
| Node.js | 24 LTS (`engines.node >=24`, `.nvmrc`) |
| npm | 11+ (`allowScripts` for puppeteer/esbuild install scripts) |
| Server build | `tsc -p tsconfig.server.json` → `dist/server` |
| Client build | Vite → `dist/client` (served statically in production, Vite middleware in dev) |
