/**
 * @file Zustand 상태 관리 스토어
 * @description 애플리케이션 전역 상태를 관리하는 Zustand 스토어
 *
 * Zustand란?
 * - React용 경량 상태 관리 라이브러리
 * - Redux보다 간단하고 보일러플레이트가 적음
 * - Hook 기반으로 컴포넌트에서 직접 사용
 *
 * 이 스토어의 역할:
 * - Space 목록 관리
 * - 선택된 Space/Page 상태 관리
 * - 페이지/트리 데이터 캐싱
 * - 로딩/에러 상태 관리
 * - 캐시 갱신 기능
 */

import { create } from 'zustand';
import { Space, Page, TreeNode, TreeStats, api } from '../services/api';

// ===== 타입 정의 =====

/**
 * 캐시된 트리 데이터 인터페이스
 *
 * @description
 * Space별로 트리와 통계를 함께 캐싱
 * Map의 value로 사용됨
 */
interface CachedTreeData {
  tree: TreeNode[];   // 트리 구조
  stats: TreeStats;   // 통계 정보
}

/**
 * 애플리케이션 상태 인터페이스
 *
 * @description
 * Zustand 스토어의 전체 상태와 액션을 정의
 * 상태(state)와 액션(action)이 하나의 인터페이스에 통합됨
 */
interface AppState {
  // ===== 상태 (State) =====

  /** 전체 Space 목록 */
  spaces: Space[];
  /** Space 목록 로드 완료 여부 (중복 호출 방지용) */
  spacesLoaded: boolean;
  /** Space 목록 로딩 중 여부 */
  spacesLoading: boolean;

  /** 현재 선택된 Space (null이면 미선택) */
  selectedSpace: Space | null;
  /** 현재 선택된 페이지 ID (null이면 미선택) */
  selectedPageId: string | null;

  /**
   * 페이지 캐시
   * Map<SpaceID, Page[]>
   * Space별로 페이지 배열을 캐싱
   */
  pagesCache: Map<string, Page[]>;
  /**
   * 트리 캐시
   * Map<SpaceID, CachedTreeData>
   * Space별로 트리와 통계를 캐싱
   */
  treeCache: Map<string, CachedTreeData>;

  /** Space 데이터(페이지/트리) 로딩 중 여부 */
  spaceDataLoading: boolean;
  /** 에러 메시지 (null이면 에러 없음) */
  error: string | null;

  // ===== 액션 (Actions) =====

  /** Space 목록 로드 */
  loadSpaces: () => Promise<void>;
  /** Space 선택 및 데이터 로드 */
  selectSpace: (space: Space) => Promise<void>;
  /** 페이지 선택 */
  selectPage: (pageId: string | null) => void;

  // ===== Getter 함수 =====

  /** 현재 선택된 페이지 객체 반환 */
  getSelectedPage: () => Page | null;
  /** 현재 Space의 페이지 배열 반환 */
  getCurrentPages: () => Page[];
  /** 현재 Space의 트리 반환 */
  getCurrentTree: () => TreeNode[] | null;
  /** 현재 Space의 통계 반환 */
  getCurrentStats: () => TreeStats | null;

  // ===== 캐시 관리 =====

  /** 모든 캐시 클리어 */
  clearCache: () => void;
  /** 현재 Space 새로고침 (캐시 우회) */
  refreshCurrentSpace: () => Promise<void>;
}

// ===== Zustand 스토어 생성 =====

/**
 * 메인 Zustand 스토어
 *
 * @description
 * create<AppState> 제네릭으로 타입 안전성 확보
 * set: 상태 업데이트 함수
 * get: 현재 상태 읽기 함수
 *
 * @example
 * // 컴포넌트에서 사용
 * const { spaces, loadSpaces } = useStore();
 *
 * // 특정 상태만 구독 (리렌더링 최적화)
 * const selectedSpace = useStore(state => state.selectedSpace);
 */
export const useStore = create<AppState>((set, get) => ({
  // ===== 초기 상태 =====
  spaces: [],
  spacesLoaded: false,
  spacesLoading: false,
  selectedSpace: null,
  selectedPageId: null,
  pagesCache: new Map(),  // 빈 Map으로 초기화
  treeCache: new Map(),
  spaceDataLoading: false,
  error: null,

  // ===== 액션 구현 =====

  /**
   * Space 목록 로드 (한 번만 실행)
   *
   * @description
   * 중복 호출 방지를 위해 spacesLoaded 플래그 확인
   * 이미 로드됐거나 로딩 중이면 무시
   */
  loadSpaces: async () => {
    const { spacesLoaded, spacesLoading } = get();

    // 중복 호출 방지
    if (spacesLoaded || spacesLoading) return;

    // 로딩 시작
    set({ spacesLoading: true, error: null });

    try {
      // API 호출
      const spaces = await api.getSpaces();

      // 성공: 상태 업데이트
      set({ spaces, spacesLoaded: true, spacesLoading: false });
    } catch (err) {
      // 실패: 에러 메시지 설정
      set({
        error: 'Failed to load spaces. Check your .env configuration.',
        spacesLoading: false,
      });
    }
  },

  /**
   * Space 선택 및 데이터 로드 (캐싱 적용)
   *
   * @param {Space} space - 선택할 Space
   *
   * @description
   * 1. 선택 상태 업데이트
   * 2. 캐시 확인 - 있으면 바로 반환
   * 3. 없으면 API 호출 후 캐시 저장
   *
   * 캐시 전략:
   * - Space별로 페이지와 트리를 별도 Map에 저장
   * - 동일 Space 재선택 시 API 호출 없이 캐시 사용
   */
  selectSpace: async (space: Space) => {
    const { pagesCache, treeCache } = get();

    // 선택 상태 업데이트 (페이지 선택 초기화)
    set({
      selectedSpace: space,
      selectedPageId: null,
      error: null,
    });

    // 캐시 확인: 이미 데이터가 있으면 API 호출 생략
    const cachedPages = pagesCache.get(space.id);
    const cachedTree = treeCache.get(space.id);

    if (cachedPages && cachedTree) {
      // 캐시 히트 - 추가 작업 불필요
      return;
    }

    // 캐시 미스 - API 호출 필요
    set({ spaceDataLoading: true });

    try {
      // 트리와 페이지를 병렬로 요청 (Promise.all)
      // 순차 호출보다 빠름
      const [treeData, pages] = await Promise.all([
        api.getTree(space.id),
        api.getPages(space.id),
      ]);

      // 캐시 업데이트
      // 기존 Map을 복사하고 새 항목 추가 (불변성 유지)
      const newPagesCache = new Map(get().pagesCache);
      const newTreeCache = new Map(get().treeCache);
      newPagesCache.set(space.id, pages);
      newTreeCache.set(space.id, { tree: treeData.tree, stats: treeData.stats });

      // 상태 업데이트
      set({
        pagesCache: newPagesCache,
        treeCache: newTreeCache,
        spaceDataLoading: false,
      });
    } catch (err) {
      // 에러 처리
      set({
        error: 'Failed to load space data.',
        spaceDataLoading: false,
      });
    }
  },

  /**
   * 페이지 선택
   *
   * @param {string | null} pageId - 선택할 페이지 ID (null이면 선택 해제)
   */
  selectPage: (pageId: string | null) => {
    set({ selectedPageId: pageId });
  },

  // ===== Getter 구현 =====

  /**
   * 현재 선택된 페이지 객체 반환
   *
   * @returns {Page | null} 선택된 페이지 또는 null
   *
   * @description
   * 캐시에서 현재 Space의 페이지 배열을 조회하고
   * 선택된 ID에 해당하는 페이지를 찾아 반환
   */
  getSelectedPage: () => {
    const { selectedSpace, selectedPageId, pagesCache } = get();

    // Space나 Page가 선택되지 않았으면 null
    if (!selectedSpace || !selectedPageId) return null;

    // 캐시에서 페이지 배열 조회
    const pages = pagesCache.get(selectedSpace.id);
    if (!pages) return null;

    // ID로 페이지 찾기
    return pages.find((p) => p.id === selectedPageId) || null;
  },

  /**
   * 현재 Space의 페이지 배열 반환
   *
   * @returns {Page[]} 페이지 배열 (없으면 빈 배열)
   */
  getCurrentPages: () => {
    const { selectedSpace, pagesCache } = get();
    if (!selectedSpace) return [];
    return pagesCache.get(selectedSpace.id) || [];
  },

  /**
   * 현재 Space의 트리 반환
   *
   * @returns {TreeNode[] | null} 트리 배열 또는 null
   */
  getCurrentTree: () => {
    const { selectedSpace, treeCache } = get();
    if (!selectedSpace) return null;
    return treeCache.get(selectedSpace.id)?.tree || null;
  },

  /**
   * 현재 Space의 통계 반환
   *
   * @returns {TreeStats | null} 통계 객체 또는 null
   */
  getCurrentStats: () => {
    const { selectedSpace, treeCache } = get();
    if (!selectedSpace) return null;
    return treeCache.get(selectedSpace.id)?.stats || null;
  },

  // ===== 캐시 관리 구현 =====

  /**
   * 모든 캐시 클리어
   *
   * @description
   * 새로운 빈 Map으로 교체하여 모든 캐시 삭제
   * 메모리 해제 및 강제 새로고침 시 사용
   */
  clearCache: () => {
    set({
      pagesCache: new Map(),
      treeCache: new Map(),
    });
  },

  /**
   * 현재 Space 새로고침 (서버 캐시도 우회)
   *
   * @description
   * 삭제 작업 후 최신 데이터 반영을 위해 사용
   *
   * 동작 순서:
   * 1. 로컬 캐시에서 현재 Space 삭제
   * 2. refresh=true로 API 호출 (서버 캐시 우회)
   * 3. 새 데이터로 캐시 갱신
   *
   * 이중 캐시 무효화:
   * - 클라이언트: pagesCache/treeCache에서 삭제
   * - 서버: ?refresh=true 쿼리로 5분 캐시 우회
   */
  refreshCurrentSpace: async () => {
    const { selectedSpace, pagesCache, treeCache } = get();

    // Space가 선택되지 않았으면 무시
    if (!selectedSpace) return;

    // Step 1: 로컬 캐시에서 현재 Space 삭제
    const newPagesCache = new Map(pagesCache);
    const newTreeCache = new Map(treeCache);
    newPagesCache.delete(selectedSpace.id);
    newTreeCache.delete(selectedSpace.id);
    set({ pagesCache: newPagesCache, treeCache: newTreeCache });

    // Step 2: 로딩 상태 설정 및 페이지 선택 초기화
    set({ spaceDataLoading: true, selectedPageId: null });

    try {
      // Step 3: refresh=true로 API 호출 (서버 캐시 우회)
      const [treeData, pages] = await Promise.all([
        api.getTree(selectedSpace.id, true),   // refresh=true
        api.getPages(selectedSpace.id, true),  // refresh=true
      ]);

      // Step 4: 새 데이터로 캐시 갱신
      const updatedPagesCache = new Map(get().pagesCache);
      const updatedTreeCache = new Map(get().treeCache);
      updatedPagesCache.set(selectedSpace.id, pages);
      updatedTreeCache.set(selectedSpace.id, { tree: treeData.tree, stats: treeData.stats });

      // 상태 업데이트
      set({
        pagesCache: updatedPagesCache,
        treeCache: updatedTreeCache,
        spaceDataLoading: false,
      });
    } catch (err) {
      // 에러 처리
      set({
        error: 'Failed to refresh space data.',
        spaceDataLoading: false,
      });
    }
  },
}));
