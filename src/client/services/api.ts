/**
 * @file API 클라이언트 모듈
 * @description 백엔드 서버와 통신하는 API 함수들의 모음
 *
 * 주요 기능:
 * - Space 목록 조회
 * - 페이지 및 트리 데이터 조회
 * - 페이지 미리보기 (HTML/Markdown)
 * - 백업 다운로드 (단일 페이지/다중 백업)
 * - 페이지 삭제
 *
 * 통신 방식:
 * - RESTful API 호출 (fetch 사용)
 * - JSON 형식의 요청/응답
 * - Blob 다운로드 (ZIP 파일)
 */

// ===== 타입 정의 =====

/**
 * Confluence Space 정보
 *
 * @property {string} id - Space 고유 ID
 * @property {string} name - Space 표시 이름
 * @property {string} key - Space 고유 키 (URL에 사용)
 */
export interface Space {
  id: string;
  name: string;
  key: string;
}

/**
 * Confluence 페이지 정보
 *
 * @property {string} id - 페이지 고유 ID
 * @property {string} title - 페이지 제목
 * @property {string} spaceId - 소속 Space ID
 * @property {string | null} parentId - 부모 페이지 ID (루트면 null)
 * @property {'space' | 'page'} parentType - 부모 타입 (space면 루트 페이지)
 * @property {string} status - 페이지 상태 ('current' 등)
 * @property {string} createdAt - 생성 일시 (ISO 형식)
 * @property {object} body - 페이지 본문 (선택적)
 */
export interface Page {
  id: string;
  title: string;
  spaceId: string;
  parentId: string | null;
  parentType: 'space' | 'page';
  status: string;
  createdAt: string;
  body?: {
    storage?: {
      value: string; // Confluence storage format (HTML)
    };
  };
}

/**
 * 클라이언트용 트리 노드
 *
 * @description
 * 페이지 계층 구조를 표현하는 최소 정보
 * 서버에서 간소화되어 전송됨
 */
export interface TreeNode {
  id: string;              // 페이지 ID
  title: string;           // 페이지 제목
  children: TreeNode[];    // 자식 노드 배열
}

/**
 * 트리 통계 정보
 *
 * @property {number} totalPages - 전체 페이지 수
 * @property {number} rootPages - 루트 레벨 페이지 수
 * @property {number} maxDepth - 최대 중첩 깊이
 */
export interface TreeStats {
  totalPages: number;
  rootPages: number;
  maxDepth: number;
}

/**
 * 트리 API 응답 형식
 */
export interface TreeResponse {
  tree: TreeNode[];    // 트리 구조
  stats: TreeStats;    // 통계 정보
}

/**
 * 백업 출력 포맷 타입
 *
 * @description
 * 단일 포맷: 'html', 'markdown', 'pdf'
 * 복합 포맷: 'html+md', 'html+pdf', 'md+pdf', 'all'
 */
export type BackupFormat = 'html' | 'markdown' | 'pdf' | 'html+md' | 'html+pdf' | 'md+pdf' | 'all';

/**
 * 백업 레벨 타입
 *
 * @description
 * - 'space': 전체 Space 백업
 * - 'folder': 선택한 폴더(페이지)와 하위 페이지 백업
 * - 'page': 선택한 개별 페이지만 백업
 */
export type BackupLevel = 'space' | 'folder' | 'page';

/**
 * 백업 요청 인터페이스
 */
export interface BackupRequest {
  spaceId: string;           // 대상 Space ID
  spaceName: string;         // Space 이름 (파일명에 사용)
  format: BackupFormat;      // 출력 포맷
  level: BackupLevel;        // 백업 범위
  targetIds?: string[];      // level이 'folder' 또는 'page'일 때 대상 ID 목록
}

/**
 * 백업 결과 인터페이스
 */
export interface BackupResult {
  success: boolean;          // 성공 여부
  outputPath: string;        // 출력 경로
  results: {
    html?: { htmlCount: number; jsonCount: number };          // HTML 결과
    markdown?: { mdCount: number; skippedCount: number };     // Markdown 결과
    pdf?: { pdfCount: number; skippedCount: number };         // PDF 결과
  };
}

// ===== API 기본 설정 =====

/** API 기본 URL (프록시 경로) */
const BASE_URL = '/api';

/**
 * JSON API 요청 헬퍼 함수
 *
 * @template T - 응답 타입
 * @param {string} url - API 경로 (/api 이후 부분)
 * @param {RequestInit} options - fetch 옵션
 * @returns {Promise<T>} 파싱된 JSON 응답
 * @throws {Error} HTTP 에러 또는 파싱 실패 시
 *
 * @description
 * 모든 API 호출의 공통 로직을 처리:
 * 1. BASE_URL과 경로 조합
 * 2. Content-Type 헤더 자동 설정
 * 3. 응답 상태 확인 및 에러 처리
 * 4. JSON 파싱
 *
 * @example
 * const data = await fetchJson<{ spaces: Space[] }>('/spaces');
 */
async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  // fetch 호출: BASE_URL + 경로
  const response = await fetch(`${BASE_URL}${url}`, {
    headers: {
      'Content-Type': 'application/json', // JSON 형식 명시
    },
    ...options, // 추가 옵션 병합 (method, body 등)
  });

  // HTTP 에러 처리 (4xx, 5xx)
  if (!response.ok) {
    // 에러 메시지 추출 시도
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  // JSON 파싱하여 반환
  return response.json();
}

// ===== API 함수 객체 =====

/**
 * API 클라이언트 객체
 *
 * @description
 * 모든 API 호출 메서드를 포함하는 객체
 * 각 메서드는 특정 엔드포인트와 통신
 */
export const api = {
  /**
   * 모든 Space 목록 조회
   *
   * @returns {Promise<Space[]>} Space 배열
   *
   * @example
   * const spaces = await api.getSpaces();
   */
  async getSpaces(): Promise<Space[]> {
    const data = await fetchJson<{ spaces: Space[] }>('/spaces');
    return data.spaces;
  },

  /**
   * 특정 Space의 페이지 목록 조회
   *
   * @param {string} spaceId - Space ID
   * @param {boolean} refresh - 서버 캐시 우회 여부
   * @returns {Promise<Page[]>} 페이지 배열
   *
   * @description
   * refresh=true 시 서버의 5분 캐시를 무시하고
   * Confluence API에서 최신 데이터를 가져옴
   */
  async getPages(spaceId: string, refresh = false): Promise<Page[]> {
    // refresh 플래그에 따라 쿼리 파라미터 추가
    const query = refresh ? '?refresh=true' : '';
    const data = await fetchJson<{ pages: Page[] }>(`/spaces/${spaceId}/pages${query}`);
    return data.pages;
  },

  /**
   * 특정 Space의 트리 구조 조회
   *
   * @param {string} spaceId - Space ID
   * @param {boolean} refresh - 서버 캐시 우회 여부
   * @returns {Promise<TreeResponse>} 트리 및 통계 정보
   */
  async getTree(spaceId: string, refresh = false): Promise<TreeResponse> {
    const query = refresh ? '?refresh=true' : '';
    return fetchJson<TreeResponse>(`/spaces/${spaceId}/tree${query}`);
  },

  /**
   * 페이지 미리보기 데이터 조회
   *
   * @param {string} pageId - 페이지 ID
   * @returns {Promise<{html: string, markdown: string}>} HTML 및 Markdown 변환 결과
   *
   * @description
   * 서버에서 Confluence storage format을 HTML과 Markdown으로 변환하여 반환
   */
  async getPagePreview(pageId: string): Promise<{ html: string; markdown: string }> {
    return fetchJson(`/pages/${pageId}/preview`);
  },

  /**
   * 백업 작업 시작 (서버 저장용)
   *
   * @param {BackupRequest} request - 백업 요청 정보
   * @returns {Promise<BackupResult>} 백업 결과
   *
   * @description
   * 서버의 data/ 디렉토리에 백업 파일 생성
   * 클라이언트 다운로드가 아닌 서버 저장 용도
   */
  async startBackup(request: BackupRequest): Promise<BackupResult> {
    return fetchJson<BackupResult>('/backup', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  /**
   * 단일 페이지 다운로드
   *
   * @param {string} pageId - 페이지 ID
   * @param {string} spaceName - Space 이름 (파일명에 사용)
   * @param {object} formats - 다운로드할 포맷 선택
   * @returns {Promise<void>}
   *
   * @description
   * 선택한 포맷으로 페이지를 ZIP으로 묶어 다운로드
   *
   * 동작 방식:
   * 1. POST 요청으로 서버에서 ZIP 생성
   * 2. Blob으로 응답 수신
   * 3. 가상 링크 생성하여 다운로드 트리거
   * 4. 리소스 정리 (URL.revokeObjectURL)
   */
  async downloadPage(
    pageId: string,
    spaceName: string,
    formats: { html?: boolean; md?: boolean; pdf?: boolean }
  ): Promise<void> {
    // POST 요청으로 ZIP 파일 요청
    const response = await fetch(`${BASE_URL}/pages/${pageId}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formats, spaceName }),
    });

    // 에러 처리
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Download failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    // Content-Disposition 헤더에서 파일명 추출
    // 서버가 "filename=페이지제목.zip" 형식으로 전송
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = `page_${pageId}.zip`; // 기본 파일명
    if (contentDisposition) {
      // 정규식으로 filename 값 추출
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match) filename = match[1];
    }

    // Blob 다운로드 패턴
    // 1. 응답을 Blob으로 변환
    const blob = await response.blob();

    // 2. Blob URL 생성 (메모리 내 임시 URL)
    const url = URL.createObjectURL(blob);

    // 3. 가상 앵커 요소 생성 및 클릭
    const a = document.createElement('a');
    a.href = url;
    a.download = filename; // 다운로드 파일명 지정
    document.body.appendChild(a);
    a.click(); // 다운로드 트리거

    // 4. 정리: DOM에서 제거 및 메모리 해제
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * 페이지 일괄 삭제
   *
   * @param {string[]} pageIds - 삭제할 페이지 ID 배열
   * @param {boolean} includeChildren - 하위 페이지 포함 여부
   * @param {string} spaceId - 캐시 무효화를 위한 Space ID (선택적)
   * @returns {Promise<object>} 삭제 결과
   *
   * @description
   * 선택한 페이지들을 일괄 삭제
   * includeChildren=true 시 각 페이지의 모든 하위 페이지도 삭제
   * spaceId 전달 시 서버에서 해당 Space 캐시도 함께 무효화
   */
  async deletePages(
    pageIds: string[],
    includeChildren: boolean,
    spaceId?: string
  ): Promise<{ success: boolean; message: string; results: { pageId: string; success: boolean; error?: string }[] }> {
    return fetchJson('/pages/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ pageIds, includeChildren, spaceId }),
    });
  },

  /**
   * 다중 페이지/폴더/Space 백업 다운로드
   *
   * @param {string} spaceId - Space ID
   * @param {string} spaceName - Space 이름
   * @param {object} formats - 다운로드할 포맷 선택
   * @param {BackupLevel} level - 백업 범위 (space/folder/page)
   * @param {string[]} targetIds - 대상 페이지 ID 목록 (level이 folder/page일 때)
   * @returns {Promise<void>}
   *
   * @description
   * 지정된 범위의 페이지들을 ZIP으로 묶어 다운로드
   * downloadPage와 동일한 Blob 다운로드 패턴 사용
   */
  async downloadBackup(
    spaceId: string,
    spaceName: string,
    formats: { html?: boolean; md?: boolean; pdf?: boolean },
    level: BackupLevel,
    targetIds?: string[]
  ): Promise<void> {
    // POST 요청으로 백업 ZIP 요청
    const response = await fetch(`${BASE_URL}/backup/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spaceId, spaceName, formats, level, targetIds }),
    });

    // 에러 처리
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Download failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    // 파일명 추출
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = `${spaceId}_backup.zip`; // 기본 파일명
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match) filename = match[1];
    }

    // Blob 다운로드 (downloadPage와 동일 패턴)
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};
