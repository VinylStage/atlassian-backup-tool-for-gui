# 기술 문서

## 프로젝트 구조

```
atlassian-backup-tool-for-gui/
├── src/
│   ├── client/                 # React 프론트엔드
│   │   ├── components/         # React 컴포넌트
│   │   ├── services/           # API 클라이언트
│   │   ├── store/              # Zustand 상태 관리
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css           # Tailwind CSS
│   └── server/                 # Express 백엔드
│       ├── routes/             # API 라우트
│       ├── services/           # 비즈니스 로직
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
| `bash`, `sh`, `shell` | Bash |
| `sql`, `html`, `css`, `json`, `yaml` | 각각 지원 |

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

### Spaces

```
GET /api/spaces
```

모든 Confluence Space 목록 조회

### Pages

```
GET /api/pages/:spaceId
```

특정 Space의 모든 페이지 조회

```
GET /api/pages/:spaceId/:pageId/preview
```

페이지 미리보기 (HTML/Markdown 변환)

### Attachments

```
GET /api/attachments/:pageId
```

페이지의 첨부파일 목록

```
GET /api/attachments/:pageId/:filename
```

첨부파일 다운로드/서빙

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
| `CONFLUENCE_DOMAIN` | Confluence 도메인 (예: `company.atlassian.net`) | Yes |
| `CONFLUENCE_EMAIL` | Atlassian 계정 이메일 | Yes |
| `CONFLUENCE_API_TOKEN` | API 토큰 | Yes |
| `PORT` | 서버 포트 (기본: 3000) | No |
| `DATA_DIR` | 데이터 저장 경로 (기본: `./data`) | No |
