# Confluence Backup Tool (Web UI)

Confluence Cloud 데이터를 로컬에 백업하는 웹 기반 도구입니다. 기존 Python CLI 도구를 Node.js + React로 마이그레이션한 버전입니다.

## 주요 기능

- Confluence Space 목록 조회
- 페이지 트리 구조 시각화
- 페이지 미리보기 (Markdown / HTML / Raw)
- 다양한 포맷으로 백업 (HTML, Markdown, PDF)
- GitHub 스타일 Markdown 렌더링 (추가 CSS 불필요)

---

## Quick Start (빠른 시작)

```bash
# 1. 의존성 설치
npm install

# 2. 환경 설정
cp .env.template .env
# .env 파일을 열어 Confluence 인증 정보 입력

# 3. 서버 실행
npm run dev

# 4. 브라우저에서 접속
# http://localhost:3000
```

---

## 시스템 요구사항

| 항목 | 최소 버전 | 권장 버전 |
|------|----------|----------|
| **Node.js** | 18.0.0 | 20.x 이상 |
| **npm** | 9.0.0 | 10.x 이상 |

### Node.js 버전 확인

```bash
node --version  # v18.0.0 이상이어야 함
npm --version   # 9.0.0 이상이어야 함
```

### Node.js 설치 (없는 경우)

**nvm 사용 (권장)**
```bash
# nvm 설치 후
nvm install 20
nvm use 20
```

**직접 설치**
- https://nodejs.org 에서 LTS 버전 다운로드

---

## Advanced Guide (상세 가이드)

### 1. 환경 설정

#### .env 파일 설정

```bash
cp .env.template .env
```

`.env` 파일을 열어 다음 값을 입력:

| 변수 | 설명 | 예시 |
|------|------|------|
| `DOMAIN` | Atlassian 도메인 | `yourcompany.atlassian.net` |
| `EMAIL` | Atlassian 계정 이메일 | `user@company.com` |
| `API_TOKEN` | Atlassian API 토큰 | (64자리 토큰) |
| `PORT` | 서버 포트 (선택) | `3000` |

#### API 토큰 발급 방법

1. https://id.atlassian.com/manage-profile/security/api-tokens 접속
2. "Create API token" 클릭
3. 토큰 이름 입력 후 생성
4. 생성된 토큰을 `.env` 파일의 `API_TOKEN`에 붙여넣기

### 2. 실행 모드

#### 개발 모드 (HMR 지원)

```bash
npm run dev
```

- Vite HMR(Hot Module Replacement) 활성화
- 코드 수정 시 자동 새로고침
- http://localhost:3000

#### 프로덕션 빌드

```bash
# 빌드
npm run build

# 실행
npm start
```

### 3. 프로젝트 구조

```
atlassian-backup-tool-for-gui/
├── src/
│   ├── server/                 # Express 백엔드
│   │   ├── index.ts            # 서버 진입점
│   │   ├── config.ts           # 환경 설정
│   │   ├── routes/             # API 라우트
│   │   │   ├── spaces.ts       # /api/spaces
│   │   │   ├── pages.ts        # /api/pages
│   │   │   └── backup.ts       # /api/backup
│   │   └── services/           # 비즈니스 로직
│   │       ├── confluenceClient.ts  # Confluence API
│   │       ├── parser.ts            # 포맷 변환
│   │       └── treeBuilder.ts       # 트리 구조
│   │
│   └── client/                 # React 프론트엔드
│       ├── App.tsx             # 메인 컴포넌트
│       ├── components/         # UI 컴포넌트
│       │   ├── SpaceList.tsx
│       │   ├── PageTree.tsx
│       │   ├── PageViewer.tsx
│       │   ├── MarkdownRenderer.tsx
│       │   └── BackupPanel.tsx
│       └── services/
│           └── api.ts          # API 클라이언트
│
├── data/                       # 백업 출력 디렉토리
├── logs/                       # 로그 파일
├── package.json
├── vite.config.ts
└── tsconfig.json
```

### 4. API 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/spaces` | Space 목록 조회 |
| GET | `/api/spaces/:id/pages` | Space 내 페이지 조회 |
| GET | `/api/spaces/:id/tree` | 페이지 트리 구조 |
| GET | `/api/pages/:id/preview` | 페이지 미리보기 |
| POST | `/api/backup` | 백업 실행 |
| GET | `/api/health` | 서버 상태 확인 |

### 5. 백업 출력 형식

백업 실행 시 `data/` 디렉토리에 다음 구조로 저장됩니다:

```
data/
├── pages_from_space_{SPACE_ID}.json    # Raw API 응답
└── space_{SPACE_ID}/
    ├── html/
    │   └── space-{ID}_{NAME}/
    │       └── folder-{PARENT_ID}_{TITLE}/
    │           ├── {PAGE_ID}_{TITLE}.html
    │           └── {PAGE_ID}_{TITLE}.json
    ├── markdown/
    │   └── space-{ID}_{NAME}/
    │       └── folder-{PARENT_ID}_{TITLE}/
    │           └── {PAGE_ID}_{TITLE}.md
    └── pdf/
        └── space-{ID}_{NAME}/
            └── folder-{PARENT_ID}_{TITLE}/
                └── {PAGE_ID}_{TITLE}.pdf
```

### 6. 문제 해결

#### "Missing environment variables" 경고

`.env` 파일이 없거나 필수 값이 누락됨:
```bash
cp .env.template .env
# .env 파일 편집하여 DOMAIN, EMAIL, API_TOKEN 입력
```

#### API 호출 실패 (401 Unauthorized)

- API 토큰이 올바른지 확인
- 이메일 주소가 Atlassian 계정과 일치하는지 확인

#### PDF 생성 실패

Puppeteer가 Chromium을 찾지 못하는 경우:
```bash
# Chromium 재설치
npx puppeteer browsers install chrome
```

#### 포트 충돌

`.env` 파일에서 다른 포트 지정:
```
PORT=3001
```

---

## 기술 스택

- **Backend**: Express.js, TypeScript
- **Frontend**: React, Vite
- **Markdown**: react-markdown, github-markdown-css
- **PDF**: Puppeteer
- **API**: Confluence Cloud REST API v2

---

## 라이선스

MIT License
