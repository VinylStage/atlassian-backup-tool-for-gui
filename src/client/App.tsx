/**
 * @file 메인 애플리케이션 컴포넌트
 * @description Confluence Backup Tool의 최상위 React 컴포넌트
 *
 * 레이아웃 구조:
 * ┌──────────────────────────────────────────────────┐
 * │                   App Container                    │
 * ├──────────────┬───┬────────────────────────────────┤
 * │   Sidebar    │ R │         Main Content           │
 * │              │ e │                                │
 * │ - SpaceList  │ s │ - Header                       │
 * │ - PageTree   │ i │ - PageViewer                   │
 * │ - Stats      │ z │                                │
 * │ - BackupPanel│ e │                                │
 * │              │   │                                │
 * └──────────────┴───┴────────────────────────────────┘
 *
 * 주요 기능:
 * - Space 목록 표시 및 선택
 * - 페이지 트리 탐색
 * - 페이지 미리보기
 * - 사이드바 크기 조절 (드래그)
 * - 새로고침 기능
 */

import { useEffect, useState, useCallback } from 'react';
import SpaceList from './components/SpaceList';
import PageTree from './components/PageTree';
import PageViewer from './components/PageViewer';
import BackupPanel from './components/BackupPanel';
import { useStore } from './store/useStore';

// ===== 사이드바 크기 설정 상수 =====

/** 사이드바 최소 너비 (px) */
const SIDEBAR_MIN_WIDTH = 240;
/** 사이드바 최대 너비 (px) */
const SIDEBAR_MAX_WIDTH = 600;
/** 사이드바 기본 너비 (px) */
const SIDEBAR_DEFAULT_WIDTH = 320;
/** localStorage 저장 키 */
const SIDEBAR_STORAGE_KEY = 'sidebarWidth';

/**
 * 메인 App 컴포넌트
 *
 * @description
 * 전체 애플리케이션의 레이아웃과 상태를 관리
 * Zustand 스토어에서 전역 상태를 가져와 자식 컴포넌트에 전달
 *
 * @returns {JSX.Element} 앱 UI
 */
export default function App() {
  // ===== Zustand 스토어에서 상태 및 액션 추출 =====
  const {
    spaces,              // Space 목록
    spacesLoading,       // Space 로딩 중
    selectedSpace,       // 선택된 Space
    selectedPageId,      // 선택된 페이지 ID
    spaceDataLoading,    // Space 데이터 로딩 중
    error,               // 에러 메시지
    loadSpaces,          // Space 목록 로드 함수
    selectSpace,         // Space 선택 함수
    selectPage,          // 페이지 선택 함수
    getSelectedPage,     // 선택된 페이지 객체 getter
    getCurrentTree,      // 현재 트리 getter
    getCurrentStats,     // 현재 통계 getter
    getCurrentPages,     // 현재 페이지 배열 getter
    refreshCurrentSpace, // 새로고침 함수
  } = useStore();

  // ===== 사이드바 리사이즈 상태 =====

  /**
   * 사이드바 너비 상태
   *
   * @description
   * 초기값은 localStorage에서 복원하거나 기본값 사용
   * 지연 초기화 패턴: useState(() => ...)
   * - 컴포넌트 마운트 시 한 번만 실행됨
   * - 매 렌더링마다 localStorage 접근하지 않음
   */
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    // parseInt(string, radix): 문자열을 정수로 변환
    // 10은 10진수를 의미
    return saved ? parseInt(saved, 10) : SIDEBAR_DEFAULT_WIDTH;
  });

  /**
   * 리사이즈 진행 중 여부
   *
   * @description
   * true일 때 마우스 이동을 감지하여 사이드바 너비 조정
   */
  const [isResizing, setIsResizing] = useState(false);

  // ===== 초기 데이터 로드 =====

  /**
   * 컴포넌트 마운트 시 Space 목록 로드
   *
   * @description
   * useEffect의 의존성 배열에 loadSpaces 포함
   * loadSpaces는 내부적으로 중복 호출을 방지함
   */
  useEffect(() => {
    loadSpaces();
  }, [loadSpaces]);

  // ===== 리사이즈 이벤트 핸들러 =====

  /**
   * 리사이즈 핸들 마우스다운 핸들러
   *
   * @description
   * 드래그 시작 시 호출
   * e.preventDefault()로 텍스트 선택 방지
   */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); // 기본 드래그 동작 방지
    setIsResizing(true); // 리사이즈 모드 활성화
  }, []);

  /**
   * 마우스 이동 핸들러
   *
   * @description
   * 드래그 중 마우스 X 좌표에 따라 사이드바 너비 조정
   * Math.min/max로 최소/최대 범위 제한
   *
   * useCallback 메모이제이션:
   * - 의존성(isResizing)이 변경될 때만 함수 재생성
   * - 이벤트 리스너 최적화에 필요
   */
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return; // 리사이즈 모드가 아니면 무시

      // 새 너비 계산: 마우스 X 좌표를 범위 내로 제한
      const newWidth = Math.min(Math.max(e.clientX, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH);
      setSidebarWidth(newWidth);
    },
    [isResizing]
  );

  /**
   * 마우스업 핸들러 (드래그 종료)
   *
   * @description
   * 드래그 종료 시:
   * 1. 리사이즈 모드 비활성화
   * 2. 현재 너비를 localStorage에 저장 (새로고침 시 복원용)
   */
  const handleMouseUp = useCallback(() => {
    if (isResizing) {
      setIsResizing(false); // 리사이즈 모드 종료
      // 너비를 localStorage에 저장
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth));
    }
  }, [isResizing, sidebarWidth]);

  // ===== 전역 이벤트 리스너 관리 =====

  /**
   * 리사이즈 중 전역 이벤트 리스너 설정
   *
   * @description
   * 리사이즈 핸들 밖으로 마우스가 벗어나도 동작하도록
   * document 레벨에서 mousemove/mouseup 감지
   *
   * 커서 및 선택 스타일 변경:
   * - cursor: col-resize → 좌우 화살표 커서
   * - userSelect: none → 드래그 중 텍스트 선택 방지
   *
   * 클린업 함수:
   * - 컴포넌트 언마운트 또는 isResizing 변경 시
   * - 이벤트 리스너 제거 및 스타일 복원
   */
  useEffect(() => {
    if (isResizing) {
      // 리사이즈 중: 이벤트 리스너 추가 및 스타일 변경
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';      // 커서 변경
      document.body.style.userSelect = 'none';        // 텍스트 선택 방지
    } else {
      // 리사이즈 종료: 이벤트 리스너 제거 및 스타일 복원
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';                // 커서 복원
      document.body.style.userSelect = '';            // 선택 복원
    }

    // 클린업 함수: 언마운트 시 정리
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // ===== 파생 데이터 계산 =====

  // Getter 함수들을 호출하여 현재 데이터 가져오기
  const tree = getCurrentTree();           // 현재 Space의 트리
  const stats = getCurrentStats();         // 현재 Space의 통계
  const pages = getCurrentPages();         // 현재 Space의 페이지 배열
  const selectedPage = getSelectedPage();  // 현재 선택된 페이지 객체

  // ===== 렌더링 =====

  return (
    <div className="app-container">
      {/* ===== 사이드바 ===== */}
      <aside className="sidebar" style={{ width: sidebarWidth }}>
        {/* Space 목록 카드 */}
        <div className="card">
          <div className="card-title">Spaces</div>
          <SpaceList
            spaces={spaces}
            selectedSpace={selectedSpace}
            onSelect={selectSpace}
            loading={spacesLoading}
          />
        </div>

        {/* 페이지 트리 카드 - Space 선택 시에만 표시 */}
        {selectedSpace && tree && (
          <div className="card">
            {/* 제목과 새로고침 버튼 */}
            <div className="card-title-with-action">
              <span className="card-title" style={{ marginBottom: 0 }}>Pages</span>
              {/* 새로고침 버튼 */}
              <button
                className="btn btn-sm btn-secondary"
                onClick={refreshCurrentSpace}
                disabled={spaceDataLoading}
                title="새로고침"
              >
                {spaceDataLoading ? '...' : '↻'}
              </button>
            </div>
            {/* 페이지 트리 컴포넌트 */}
            <PageTree
              tree={tree}
              selectedPageId={selectedPageId}
              onSelect={selectPage}
              onPagesDeleted={refreshCurrentSpace}  // 삭제 후 새로고침 콜백
            />
          </div>
        )}

        {/* 통계 카드 - Space 선택 시에만 표시 */}
        {selectedSpace && stats && (
          <div className="card">
            <div className="card-title">Stats</div>
            <div className="stats-grid">
              {/* 전체 페이지 수 */}
              <div className="stat-item">
                <div className="stat-value">{stats.totalPages}</div>
                <div className="stat-label">Pages</div>
              </div>
              {/* 루트 페이지 수 */}
              <div className="stat-item">
                <div className="stat-value">{stats.rootPages}</div>
                <div className="stat-label">Root</div>
              </div>
              {/* 최대 깊이 */}
              <div className="stat-item">
                <div className="stat-value">{stats.maxDepth}</div>
                <div className="stat-label">Depth</div>
              </div>
            </div>
          </div>
        )}

        {/* 백업 패널 - Space 선택 시에만 표시 */}
        {selectedSpace && (
          <BackupPanel
            space={selectedSpace}
            pages={pages}
            tree={tree}
          />
        )}
      </aside>

      {/* ===== 리사이즈 핸들 ===== */}
      {/* 드래그하여 사이드바 너비 조절 */}
      <div
        className="resize-handle"
        onMouseDown={handleMouseDown}
      />

      {/* ===== 메인 콘텐츠 영역 ===== */}
      <main className="main-content">
        {/* 헤더 */}
        <header className="header">
          <h1>Confluence Backup Tool</h1>
          {/* 선택된 Space 이름 표시 */}
          {selectedSpace && (
            <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
              {selectedSpace.name}
            </span>
          )}
        </header>

        {/* 에러 메시지 */}
        {error && <div className="error">{error}</div>}

        {/* 로딩 인디케이터 */}
        {(spacesLoading || spaceDataLoading) && !tree && (
          <div className="loading">Loading...</div>
        )}

        {/* 메인 콘텐츠: 조건부 렌더링 */}
        {selectedPage ? (
          // 페이지 선택됨: 미리보기 표시
          <PageViewer page={selectedPage} />
        ) : selectedSpace ? (
          // Space 선택됨, 페이지 미선택: 안내 메시지
          <div className="card" style={{ marginTop: '1rem' }}>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
              Select a page from the tree to preview its content.
            </p>
          </div>
        ) : (
          // 아무것도 선택 안됨: 시작 안내
          <div className="card" style={{ marginTop: '1rem' }}>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
              Select a space from the sidebar to get started.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
