# Atlassian Backup Tool (Web UI)

Confluence Cloud 페이지를 로컬에 백업하는 웹 기반 도구입니다.

## 주요 기능

- Confluence Space 탐색 및 페이지 트리 뷰
- HTML, Markdown, PDF 형식으로 백업
- 첨부파일 자동 다운로드
- 페이지 미리보기 (코드 하이라이팅 포함)
- 다크 모드 지원

## 요구사항

- Node.js 18+
- Confluence Cloud 계정 및 API 토큰

## 설치

```bash
npm install
```

## 환경 설정

프로젝트 루트에 `.env` 파일 생성:

```env
DOMAIN=your-domain.atlassian.net
EMAIL=your-email@example.com
API_TOKEN=your-api-token
```

API 토큰은 [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)에서 생성할 수 있습니다.

## 실행

### 개발 모드

```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 접속

### 프로덕션 빌드

```bash
npm run build
npm start
```

## 퀵 사용 가이드

### 기본 사용법

1. **Space 선택**: 좌측 사이드바에서 백업할 Space 클릭
2. **페이지 탐색**: 트리에서 페이지 선택하여 미리보기
3. **포맷 선택**: HTML, Markdown, PDF 중 원하는 형식 체크
4. **다운로드**: 개별 페이지는 "Download" 버튼, 전체는 "Start Backup"

### 주요 기능

| 기능 | 사용법 |
|------|--------|
| **사이드바 크기 조절** | 사이드바 오른쪽 경계를 드래그 |
| **페이지 새로고침** | Pages 옆 ↻ 버튼 클릭 |
| **미리보기 전환** | Preview/Markdown 탭 클릭 |
| **다중 페이지 삭제** | "선택" 버튼 → 체크박스 선택 → "삭제" 버튼 |

### 상세 가이드

일반사용자를 위한 자세한 사용 설명서는 [사용자 가이드](docs/user-guide.md)를 참조하세요.

## 출력 디렉토리 구조

```
data/{SPACE_ID}_{SPACE_NAME}/
├── _meta/
│   └── pages.json              # 전체 페이지 원본 데이터
└── pages/
    └── {PAGE_ID}_{TITLE}/      # 페이지별 디렉토리 (계층 구조 반영)
        ├── page.html           # HTML 변환
        ├── page.md             # Markdown 변환
        ├── page.pdf            # PDF 변환
        ├── meta.json           # 페이지 메타데이터
        └── attachments/        # 첨부파일
```

## 기술 스택

- **Frontend**: React, TypeScript, Tailwind CSS, Zustand
- **Backend**: Express.js, Node.js
- **Build**: Vite

## 라이선스

MIT

## 관련 문서

- [기술 문서](docs/technical.md)
