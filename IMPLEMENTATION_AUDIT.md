# Implementation Audit

## 1.1.1

### Incident

```
Download backup failed: Could not find Chrome (ver. 148.0.7778.97) ...
cache path ... /home/vinyl/.cache/puppeteer
```

### Root cause

| # | Finding | Evidence |
|---|---------|----------|
| 1 | puppeteer pins a Chrome build per version (24.43.0 → 148.0.7778.97) and downloads it in its `postinstall` script | reproduced with `PUPPETEER_SKIP_DOWNLOAD=1 npm ci` → identical error |
| 2 | npm 11 (bundled with Node 24) blocks dependency install scripts unless approved in `package.json#allowScripts`; the Chrome download was silently skipped | `npm install` output: `install-scripts not yet covered by allowScripts: puppeteer` |
| 3 | `convertPages()` called `puppeteer.launch()` directly; the raw message reached the UI and was English-only | `routes/backup.ts` returned `error.message` |

### Changes

| Area | Change | File |
|------|--------|------|
| Fix | `allowScripts` approves `puppeteer`, `esbuild`; clean `npm ci` downloads Chrome | `package.json` |
| Fix | Browser resolution: env → bundled → system; coded `AppError` (503) | `src/server/services/browser.ts` |
| Fix | Startup check logs whether PDF export is available | `src/server/index.ts` |
| Errors | `{ code, message, details, requestId }` response for backup/page download | `src/server/utils/errors.ts`, `routes/backup.ts`, `routes/pages.ts` |
| i18n | `ApiError` + `localizeError()` (ko/en by `navigator.languages`) | `src/client/services/api.ts`, `src/client/i18n/errorMessages.ts` |
| Logging | Single root logger, OS-standard dir, JSON Lines, rotation, request id, access log | `src/server/utils/logger.ts`, `utils/requestContext.ts`, `middleware/accessLog.ts`, `config.ts` |
| Deps | All latest; Node 24 / npm 11 baseline; `@types/node@^24`; removed `@types/uuid` stub; `postcss-selector-parser` override | `package.json`, `package-lock.json`, `.nvmrc` |
| Breaking | archiver 8 → `new ZipArchive()`; puppeteer 25 → `await executablePath()` | `routes/*.ts`, `services/browser.ts` |

### Behavior changes

| Item | Before | After |
|------|--------|-------|
| Log location | `./logs/<module>_<startTime>.log` (new files per module per start, no rotation) | OS-standard dir, `app.log` + `error.log`, rotation (`LOG_DIR=./logs` restores project-local dir) |
| PDF browser missing | HTTP 500, raw puppeteer message | HTTP 503, `PDF_BROWSER_NOT_FOUND`, localized UI message |
| Node.js | `>=18` | `>=24` |

### Security

| Item | Result |
|------|--------|
| `npm audit` | 28 (1 critical, 20 high, 4 moderate, 3 low) → 0 |
| Install scripts | Only `puppeteer@25.13.0`, `esbuild@0.28.2` approved (version-pinned) |
| Error details | Server filesystem paths kept in logs only; response exposes install command only |
| `X-Request-Id` input | Accepted only if `[A-Za-z0-9._-]{1,128}` (log injection guard) |

### Verification

| Check | Result |
|-------|--------|
| `tsc` server + client (TypeScript 7.0.2) | pass |
| `vite build` | pass; typography CSS byte-identical before/after selector-parser override |
| Clean `npm ci` on Node 24.21.0 / npm 11.19.0 | Chrome 155.0.8059.39 downloaded to `~/.cache/puppeteer` |
| E2E (mock Confluence) PDF without Chrome | 503 + `PDF_BROWSER_NOT_FOUND` + `requestId`; same id in console/app.log/error.log |
| E2E PDF with Chrome (`PUPPETEER_EXECUTABLE_PATH`) | 200, ZIP contains `page.pdf` (73 KB) + `page.md` |
| `npm run dev` on Node 24 | SPA + `/api/health` OK, startup browser check logged |
| Client localization | ko-KR → Korean, en-US / ja-JP → English, request id appended |
| `npm run lint` | fails before and after (no ESLint flat config in repo) — tracked in ROADMAP |
