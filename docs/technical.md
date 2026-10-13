# 기술 문서

## 프로젝트 구조

```
atlassian-backup-tool-for-gui/
├── src/
│   ├── client/                 # React 프론트엔드
│   │   ├── components/         # React 컴포넌트
│   │   ├── hooks/              # 커스텀 React 훅
│   │   ├── i18n/               # 에러 코드 → 사용자 언어 메시지 (ko/en)
│   │   ├── services/           # API 클라이언트
│   │   ├── store/              # Zustand 상태 관리
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── index.html          # HTML 엔트리 포인트
│   │   └── index.css           # Tailwind CSS
│   └── server/                 # Express 백엔드
│       ├── middleware/         # Express 미들웨어 (액세스 로그)
│       ├── routes/             # API 라우트
│       ├── services/           # 비즈니스 로직 (browser.ts: PDF용 Chrome 관리)
│       ├── types/              # TypeScript 타입
│       ├── utils/              # 유틸리티
│       ├── config.ts           # 설정
│       └── index.ts            # 서버 진입점
├── data/                       # 백업 데이터 출력
├── dist/                       # 빌드 출력
└── docs/                       # 문서
```

## 출력 디렉토리 구조

### 개요

백업된 데이터의 디렉터리 구조는 **Confluence 페이지의 실제 계층 구조를 그대로 반영**합니다.

```
data/{SPACE_ID}_{SPACE_NAME}/
├── _meta/
│   └── pages.json              # 전체 페이지 원본 API 응답
└── pages/
    └── {PAGE_ID}_{TITLE}/      # 루트 페이지
        ├── page.html           # HTML 변환 결과
        ├── page.md             # Markdown 변환 결과
        ├── page.pdf            # PDF 변환 결과
        ├── meta.json           # 개별 페이지 메타데이터
        ├── attachments/        # 첨부파일 디렉토리
        └── {CHILD_ID}_{TITLE}/ # 자식 페이지 (중첩)
            └── ...
```

### 폴더명 규칙

| 구성 요소 | 형식 | 예시 |
|----------|------|------|
| Space 폴더 | `{SPACE_ID}_{SPACE_NAME}` | `1572879_Engineering_Wiki` |
| 페이지 폴더 | `{PAGE_ID}_{PAGE_TITLE}` | `1001_Overview` |
| 특수문자/공백 | 언더바(`_`)로 치환 | `v2.0 Release` → `v2_0_Release` |
| 최대 길이 | 120자 제한 | 긴 제목은 잘림 |

### 파일명 규칙

| 파일 | 설명 |
|------|------|
| `page.html` | HTML 변환 결과 (Tailwind CSS 포함) |
| `page.md` | Markdown 변환 결과 |
| `page.pdf` | PDF 변환 결과 (A4 최적화) |
| `meta.json` | 페이지 메타데이터 (원본 API 응답) |
| `attachments/` | 첨부파일 디렉토리 |

## Confluence 매크로 변환

다음 Confluence 매크로들이 자동으로 변환됩니다:

| Confluence 매크로 | 변환 결과 |
|------------------|----------|
| `ac:structured-macro[code]` | `<pre><code>` + highlight.js 구문 강조 |
| `ac:structured-macro[expand]` | `<details><summary>제목</summary>내용</details>` |
| `ac:structured-macro[info]` | `<div class="callout callout-info">` |
| `ac:structured-macro[tip]` | `<div class="callout callout-tip">` |
| `ac:structured-macro[note]` | `<div class="callout callout-note">` |
| `ac:structured-macro[warning]` | `<div class="callout callout-warning">` |
| `ac:structured-macro[panel]` | `<div class="callout callout-panel">` |
| `ac:structured-macro[view-file]` | `<a href="./attachments/...">📎 파일명</a>` |
| `ac:structured-macro[toc]` | 제거 (로컬에서 불필요) |
| `ac:image` + `ri:attachment` | `<img src="./attachments/...">` |
| `ac:image` + `ri:url` | `<img src="외부URL">` |

## 코드 구문 강조

highlight.js를 사용하여 코드 블록에 언어별 구문 강조를 적용합니다.

### 지원 언어 (일부)

| Confluence 언어 | 변환 |
|----------------|------|
| `python`, `py` | Python |
| `javascript`, `js` | JavaScript |
| `typescript`, `ts` | TypeScript |
| `c#` | C# |
| `c++` | C++ |
| `java` | Java |
| `go` | Go |
| `rust` | Rust |
| `ruby`, `rb` | Ruby |
| `bash`, `sh`, `shell` | Bash |
| `sql`, `html`, `css`, `json` | 각각 지원 |
| `yaml`, `yml` | YAML |

## 이미지 처리

### 지원 이미지 유형

| 유형 | 설명 | 처리 방식 |
|------|------|----------|
| 첨부 이미지 (`ri:attachment`) | Confluence에 업로드된 파일 | 자동 다운로드 후 상대 경로 참조 |
| 외부 URL 이미지 (`ri:url`) | 외부 서버 이미지 | URL 그대로 사용 |

### 포맷별 처리

- **HTML**: 상대 경로 (`./attachments/image.png`)
- **Markdown**: 마크다운 문법 (외부 URL만)
- **PDF**: 상대 경로로 이미지 임베드

## API 엔드포인트

### Health

```
GET /api/health
```
서버 상태 확인

**Response:**
```json
{ "status": "ok" }
```

### Spaces

```
GET /api/spaces
```
모든 Confluence Space 목록 조회

**Response:**
```json
{ "spaces": Space[] }
```

```
GET /api/spaces/:id/pages
GET /api/spaces/:id/pages?refresh=true
```
특정 Space의 모든 페이지 조회
- `refresh=true`: 서버 캐시 무시하고 Confluence API에서 새로 조회

```
GET /api/spaces/:id/tree
GET /api/spaces/:id/tree?refresh=true
```
페이지 트리 구조 조회
- `refresh=true`: 서버 캐시 무시

### Pages

```
GET /api/pages/:id/preview
```
페이지 미리보기 (HTML/Markdown 변환 결과)

**Response:**
```json
{ "html": "string", "markdown": "string" }
```

```
POST /api/pages/:id/download
```
단일 페이지 다운로드 (ZIP)

**Request Body:**
```json
{
  "formats": { "html": true, "md": true, "pdf": false },
  "spaceName": "Engineering Wiki"
}
```

```
DELETE /api/pages/:id
```
단일 페이지 삭제 (Confluence에서 영구 삭제)

**Response:**
```json
{ "success": true, "message": "Page {id} deleted successfully" }
```

```
POST /api/pages/bulk-delete
```
다중 페이지 삭제

**Request Body:**
```json
{
  "pageIds": ["123", "456", "789"],
  "includeChildren": true,
  "spaceId": "1572879"
}
```

| 필드 | 설명 |
|------|------|
| `pageIds` | 삭제할 페이지 ID 배열 |
| `includeChildren` | true면 하위 페이지도 함께 삭제 |
| `spaceId` | Space ID (캐시 무효화용) |

**Response:**
```json
{
  "success": true,
  "message": "Deleted N pages, M failed",
  "results": [
    { "pageId": "string", "success": true },
    { "pageId": "string", "success": false, "error": "string" }
  ]
}
```

### Backup

```
POST /api/backup
```
백업 실행

**Request Body:**
```json
{
  "spaceId": "1572879",
  "spaceName": "Engineering Wiki",
  "format": "html+md",
  "level": "space",
  "targetIds": []
}
```

**Format 옵션:**
- `html` - HTML만
- `markdown` - Markdown만
- `pdf` - PDF만
- `html+md` - HTML + Markdown
- `html+pdf` - HTML + PDF
- `md+pdf` - Markdown + PDF
- `all` - 모든 형식

**Response:**
```json
{
  "success": true,
  "outputPath": "/path/to/output",
  "results": {
    "pagesProcessed": 10,
    "html": 10,
    "markdown": 10,
    "pdf": 0
  },
  "attachments": {
    "downloaded": 5,
    "failed": 0
  }
}
```

```
POST /api/backup/download
```
백업 후 ZIP 다운로드

**Request Body:**
```json
{
  "spaceId": "1572879",
  "spaceName": "Engineering Wiki",
  "formats": { "html": true, "md": true, "pdf": false },
  "level": "space",
  "targetIds": []
}
```

| 필드 | 설명 |
|------|------|
| `spaceId` | Space ID (필수) |
| `spaceName` | Space 이름 (ZIP 파일명에 사용) |
| `formats` | 출력 포맷 선택 |
| `level` | 백업 레벨: `space`, `folder`, `page` |
| `targetIds` | folder/page 레벨일 때 대상 페이지 ID 배열 |

**Response:** ZIP 파일 스트림

### Attachments

```
GET /api/attachments/:pageId
```
페이지의 첨부파일 목록 조회

**Response:**
```json
{
  "attachments": [
    { "title": "image.png", "mediaType": "image/png", ... }
  ]
}
```

```
GET /api/attachments/:pageId/:filename
```
첨부파일 다운로드

파일을 로컬 캐시에서 찾거나, 없으면 Confluence에서 다운로드하여 반환합니다.

**Response:** 파일 바이너리 스트림

## 서버 캐시 시스템

서버는 Confluence API 응답을 캐싱하여 성능을 향상시킵니다.

### 캐시 동작

| 항목 | TTL | 설명 |
|------|-----|------|
| Space 페이지 목록 | 5분 | `/api/spaces/:id/pages`, `/api/spaces/:id/tree` |
| 페이지 미리보기 | 5분 | `/api/pages/:id/preview` |

### 캐시 무효화

| 트리거 | 동작 |
|--------|------|
| `?refresh=true` 쿼리 | 해당 요청에서 캐시 무시 |
| 페이지 삭제 | 해당 Space 캐시 자동 삭제 |

## 클라이언트 상태 관리

Zustand를 사용한 상태 관리 구조:

```typescript
interface CachedTreeData {
  tree: TreeNode[];
  stats: TreeStats;
}

interface AppState {
  // ===== 상태 (State) =====

  // Spaces
  spaces: Space[];
  spacesLoaded: boolean;        // Space 목록 로드 완료 여부
  spacesLoading: boolean;       // Space 목록 로딩 중 여부
  selectedSpace: Space | null;

  // Pages
  pagesCache: Map<string, Page[]>;
  treeCache: Map<string, CachedTreeData>;
  selectedPageId: string | null;

  // Loading & Error
  spaceDataLoading: boolean;    // Space 데이터 로딩 중 여부
  error: string | null;         // 에러 메시지

  // ===== 액션 (Actions) =====

  loadSpaces(): Promise<void>;
  selectSpace(space: Space): Promise<void>;
  selectPage(pageId: string | null): void;
  refreshCurrentSpace(): Promise<void>;  // 서버 캐시 무시

  // ===== Getter 함수 =====

  getSelectedPage(): Page | null;
  getCurrentPages(): Page[];
  getCurrentTree(): TreeNode[] | null;
  getCurrentStats(): TreeStats | null;

  // ===== 캐시 관리 =====

  clearCache(): void;
}
```

## UI 기능

### 리사이즈 가능한 사이드바

- **최소 너비**: 240px
- **최대 너비**: 600px
- **기본 너비**: 320px
- **저장**: localStorage (`sidebarWidth` 키)

## 주요 의존성

### Frontend

- **React 18** - UI 프레임워크
- **Zustand** - 상태 관리
- **Tailwind CSS v4** - 스타일링
- **@tailwindcss/typography** - prose 클래스

### Backend

- **Express.js** - 웹 프레임워크
- **Axios** - HTTP 클라이언트
- **Puppeteer** - PDF 생성
- **highlight.js** - 코드 구문 강조
- **TurndownService** - HTML → Markdown 변환
- **Winston** - 로깅

## 환경 변수

| 변수 | 설명 | 필수 |
|------|------|------|
| `DOMAIN` | Confluence 도메인 (예: `company.atlassian.net`) | Yes |
| `EMAIL` | Atlassian 계정 이메일 | Yes |
| `API_TOKEN` | API 토큰 | Yes |
| `PORT` | 서버 포트 (기본: 3000) | No |
| `NODE_ENV` | 실행 환경 (기본: `development`) | No |
| `LOG_LEVEL` | 최소 로그 레벨: `error`/`warn`/`info`/`http`/`verbose`/`debug`/`silly` (기본: `info`) | No |
| `LOG_DIR` | 로그 디렉토리 (기본: OS 표준 경로, [로깅](#로깅) 참조) | No |
| `LOG_MAX_SIZE_MB` | 로그 파일 1개 최대 크기 MB (기본: 10) | No |
| `LOG_MAX_FILES` | 로테이션 보관 파일 수 (기본: 5) | No |
| `PUPPETEER_EXECUTABLE_PATH` | PDF 변환에 사용할 Chrome/Chromium 실행 파일 (지정 시 해당 경로만 사용) | No |

## 로깅

Winston 단일 루트 로거 + 모듈별 child 로거(`setupLogger('<module>')`).

### 적용 표준

| 항목 | 규칙 | 근거 |
|------|------|------|
| 저장 위치 (Linux) | `$XDG_STATE_HOME/atlassian-backup-tool/logs`, 미설정/상대경로면 `~/.local/state/...` | XDG Base Directory Spec 0.8 — 로그는 state data |
| 저장 위치 (macOS) | `~/Library/Logs/atlassian-backup-tool` | Apple File System Programming Guide |
| 저장 위치 (Windows) | `%LOCALAPPDATA%\atlassian-backup-tool\Logs` | Windows Known Folders (Local AppData) |
| 스트림 출력 | 콘솔(stdout, error는 stderr) 항상 출력 | 12-Factor App XI. Logs |
| 타임스탬프 | ISO 8601 / RFC 3339 UTC (`2026-10-13T06:40:00.123Z`) | RFC 3339 |
| 파일 포맷 | JSON Lines (1줄 1이벤트) | 구조화 로그, 수집기(Fluent Bit/Vector/Loki) 호환 |
| 레벨 | npm 레벨 (`error` < `warn` < `info` < `http` < `verbose` < `debug` < `silly`) | Winston 기본 |
| 로테이션 | 크기 기준 `LOG_MAX_SIZE_MB` × `LOG_MAX_FILES`, tailable | 디스크 무한 증가 방지 |

### 파일

| 파일 | 내용 |
|------|------|
| `app.log` | `LOG_LEVEL` 이상 전체 이벤트 |
| `error.log` | `error` 레벨 + uncaught exception / unhandled rejection |

로테이션 시 `app.log`가 최신, `app1.log`, `app2.log` … 순으로 오래된 로그입니다.
로그 디렉토리 생성에 실패하면 콘솔 전용으로 동작합니다.

### 레코드 예시

```json
{"level":"error","module":"routes_backup","requestId":"a511580e-...","code":"PDF_BROWSER_NOT_FOUND","message":"Download backup failed: ...","stack":"AppError: ...","timestamp":"2026-10-13T06:51:00.663Z"}
```

### Request ID

- 모든 요청에 `X-Request-Id` 부여 (클라이언트가 보낸 값이 `[A-Za-z0-9._-]{1,128}`이면 재사용)
- 요청 처리 중 기록되는 모든 로그에 `requestId` 자동 포함 (AsyncLocalStorage)
- 에러 응답 본문에도 `requestId` 포함 → UI에 표시된 ID로 로그 검색 가능

### 액세스 로그

`/api/*` 요청마다 `METHOD URL STATUS DURATIONms` 기록. 4xx/5xx는 `warn`, 그 외는 `http` 레벨(기본 `info`에서는 미출력, `LOG_LEVEL=http`로 활성화).

## 에러 응답 형식

백업/다운로드 API 실패 시:

```json
{
  "code": "PDF_BROWSER_NOT_FOUND",
  "message": "Chrome for PDF export is not installed. ...",
  "details": { "installCommand": "npx puppeteer browsers install chrome" },
  "requestId": "a511580e-9002-4697-b844-765f65d7cdc1"
}
```

| code | HTTP | 의미 |
|------|------|------|
| `PDF_BROWSER_NOT_FOUND` | 503 | PDF 변환용 Chrome 없음 |
| `PDF_BROWSER_LAUNCH_FAILED` | 503 | Chrome 실행 실패 (의존 라이브러리 누락, sandbox 등) |
| `INTERNAL_ERROR` | 500 | 그 외 오류 (`message`에 원인) |

클라이언트(`src/client/i18n/errorMessages.ts`)는 `navigator.languages` 기준 ko/en 메시지로 변환하고, 미등록 코드는 `message`를 그대로 표시합니다.

## PDF 변환 브라우저

`src/server/services/browser.ts`의 실행 파일 결정 순서:

1. `PUPPETEER_EXECUTABLE_PATH` (지정 시 해당 경로만 사용, 없으면 `PDF_BROWSER_NOT_FOUND`)
2. Puppeteer 번들 Chrome (`~/.cache/puppeteer`, `npm run browser:install`)
3. 시스템 Chrome/Chromium (OS별 기본 설치 경로) — 버전 불일치 가능성이 있어 경고 로그 출력

서버 시작 시 사용 가능 여부를 점검하여 로그에 남깁니다.

npm 11(Node 24 기본 포함)은 의존성 install script를 기본 차단합니다. `package.json`의 `allowScripts`에 `puppeteer`가 승인되어 있어야 `npm install` 시 Chrome이 다운로드됩니다. puppeteer 버전을 올린 경우 `npm install-scripts approve puppeteer`로 승인을 갱신하세요.
