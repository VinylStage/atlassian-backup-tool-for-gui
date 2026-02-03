/**
 * @file 페이지 트리 빌더
 * @description 평면적인 페이지 목록을 계층적 트리 구조로 변환
 *
 * Confluence 페이지 구조:
 * - 각 페이지는 parentId로 부모 페이지를 참조
 * - parentType이 'space'면 루트 페이지 (Space 직속)
 * - parentType이 'page'면 다른 페이지의 자식
 *
 * 이 모듈의 역할:
 * 1. 평면 배열 → 트리 구조 변환
 * 2. 트리 통계 계산 (깊이, 레벨별 페이지 수 등)
 * 3. 클라이언트용 간소화된 트리 생성
 */

import type { Page } from '../types/confluence.js';

/**
 * 트리 노드 인터페이스 (서버용)
 *
 * @description
 * 전체 페이지 정보를 포함하는 트리 노드
 * 내부 처리 및 백업에 사용
 */
export interface TreeNode {
  id: string;              // 페이지 ID
  title: string;           // 페이지 제목
  parentId: string | null; // 부모 페이지 ID (null이면 루트)
  parentType: string;      // 부모 타입 ('space' | 'page')
  status: string;          // 페이지 상태 ('current' 등)
  createdAt: string;       // 생성 일시
  children: TreeNode[];    // 자식 노드 배열
}

/**
 * 트리 루트 인터페이스
 *
 * @description
 * Space 전체를 나타내는 트리의 최상위 객체
 */
export interface Tree {
  spaceId: string;      // Space ID
  spaceName: string;    // Space 이름
  totalPages: number;   // 전체 페이지 수
  children: TreeNode[]; // 루트 레벨 페이지들
}

/**
 * 트리 통계 정보 인터페이스
 */
export interface TreeStats {
  totalPages: number;                 // 전체 페이지 수
  rootPages: number;                  // 루트 페이지 수
  maxDepth: number;                   // 최대 중첩 깊이
  pagesByLevel: Record<number, number>; // 레벨별 페이지 수
}

/**
 * 페이지 배열을 트리 구조로 변환
 *
 * @param {Page[]} pages - 평면 페이지 배열
 * @param {string} spaceId - Space ID
 * @param {string} spaceName - Space 이름
 * @returns {Tree} 트리 구조
 *
 * @description
 * 알고리즘:
 * 1. 모든 페이지를 Map에 저장 (ID → 노드)
 * 2. 각 페이지를 부모 노드의 children에 연결
 * 3. 루트 노드들 수집
 * 4. 제목순 정렬
 *
 * 시간 복잡도: O(n) - 각 페이지를 두 번 순회
 *
 * @example
 * const pages = [
 *   { id: '1', title: 'Root', parentType: 'space', ... },
 *   { id: '2', title: 'Child', parentId: '1', parentType: 'page', ... }
 * ];
 * const tree = buildTree(pages, 'space1', 'My Space');
 * // tree.children[0].children[0] === 'Child' 페이지
 */
export function buildTree(pages: Page[], spaceId: string, spaceName: string): Tree {
  // Step 1: 모든 페이지를 Map에 저장
  // Map을 사용하면 O(1)로 페이지 조회 가능
  const pageMap = new Map<string, TreeNode>();

  for (const page of pages) {
    if (page.id) {
      // Page → TreeNode 변환
      pageMap.set(page.id, {
        id: page.id,
        title: page.title || '',
        parentId: page.parentId,
        parentType: page.parentType || '',
        status: page.status || '',
        createdAt: page.createdAt || '',
        children: [], // 자식은 빈 배열로 초기화
      });
    }
  }

  // Step 2: 부모-자식 관계 연결
  const rootNodes: TreeNode[] = [];

  for (const [pageId, node] of pageMap) {
    const parentId = node.parentId;
    const parentType = node.parentType;

    if (parentType === 'space' || parentId === null) {
      // 루트 노드: Space 직속 페이지
      rootNodes.push(node);
    } else if (parentId && pageMap.has(parentId)) {
      // 부모가 존재하면 부모의 children에 추가
      pageMap.get(parentId)!.children.push(node);
    } else {
      // 부모를 찾을 수 없으면 루트로 처리 (고아 페이지)
      // 데이터 불일치 상황에서의 폴백
      rootNodes.push(node);
    }
  }

  // Step 3: 제목순 정렬 (재귀)
  /**
   * 노드의 자식들을 제목순으로 정렬 (재귀)
   */
  function sortChildren(node: TreeNode): void {
    // 현재 노드의 자식들 정렬
    node.children.sort((a, b) => a.title.localeCompare(b.title));

    // 각 자식의 자식들도 정렬 (재귀)
    for (const child of node.children) {
      sortChildren(child);
    }
  }

  // 루트 노드들 정렬
  rootNodes.sort((a, b) => a.title.localeCompare(b.title));

  // 각 루트 노드의 자식들 정렬
  for (const node of rootNodes) {
    sortChildren(node);
  }

  // 최종 트리 객체 반환
  return {
    spaceId,
    spaceName,
    totalPages: pages.length,
    children: rootNodes,
  };
}

/**
 * 트리 통계 정보 계산
 *
 * @param {Tree} tree - 분석할 트리
 * @returns {TreeStats} 통계 정보
 *
 * @description
 * DFS(깊이 우선 탐색)로 트리를 순회하며 통계 수집
 * - 최대 깊이
 * - 레벨별 페이지 수
 *
 * @example
 * const stats = getTreeStats(tree);
 * // { totalPages: 100, rootPages: 5, maxDepth: 4, pagesByLevel: {1: 5, 2: 20, ...} }
 */
export function getTreeStats(tree: Tree): TreeStats {
  /**
   * 노드의 최대 깊이 계산 (재귀)
   *
   * @param node - 현재 노드
   * @param currentDepth - 현재 깊이
   * @returns 이 노드 아래의 최대 깊이
   */
  function countDepth(node: TreeNode, currentDepth: number = 0): number {
    // 자식이 없으면 현재 깊이 반환 (리프 노드)
    if (node.children.length === 0) {
      return currentDepth;
    }

    // 자식들 중 최대 깊이 반환
    return Math.max(...node.children.map((child) => countDepth(child, currentDepth + 1)));
  }

  /**
   * 레벨별 노드 수 계산 (재귀)
   *
   * @param node - 현재 노드
   * @param level - 현재 레벨
   * @param counts - 레벨별 카운트 객체 (결과 누적)
   */
  function countNodesByLevel(
    node: TreeNode,
    level: number,
    counts: Record<number, number>
  ): void {
    // 현재 레벨 카운트 증가
    counts[level] = (counts[level] || 0) + 1;

    // 자식들도 재귀 처리 (레벨 + 1)
    for (const child of node.children) {
      countNodesByLevel(child, level + 1, counts);
    }
  }

  let maxDepth = 0;
  const levelCounts: Record<number, number> = {};

  // 각 루트 노드에서 시작하여 통계 수집
  for (const child of tree.children) {
    // 깊이 계산 (루트 레벨 = 1)
    const depth = countDepth(child, 1);
    if (depth > maxDepth) {
      maxDepth = depth;
    }

    // 레벨별 카운트
    countNodesByLevel(child, 1, levelCounts);
  }

  // 루트 페이지 수
  const rootPages = tree.children.length;

  return {
    totalPages: tree.totalPages,
    rootPages,
    maxDepth,
    pagesByLevel: levelCounts,
  };
}

// ===== 클라이언트용 간소화된 트리 =====

/**
 * 클라이언트용 트리 노드 인터페이스
 *
 * @description
 * 화면 표시에 필요한 최소 정보만 포함
 * 불필요한 데이터 전송 방지
 */
export interface ClientTreeNode {
  id: string;              // 페이지 ID
  title: string;           // 페이지 제목
  children: ClientTreeNode[]; // 자식 노드들
}

/**
 * 서버용 트리를 클라이언트용 트리로 변환
 *
 * @param {Tree} tree - 서버용 전체 트리
 * @returns {ClientTreeNode[]} 클라이언트용 간소화된 트리
 *
 * @description
 * 불필요한 필드(status, createdAt 등) 제거
 * 네트워크 전송량 및 클라이언트 메모리 최적화
 *
 * @example
 * const clientTree = toClientTree(serverTree);
 * // [{ id: '1', title: 'Page', children: [...] }, ...]
 */
export function toClientTree(tree: Tree): ClientTreeNode[] {
  /**
   * TreeNode → ClientTreeNode 변환 (재귀)
   */
  function toClientNode(node: TreeNode): ClientTreeNode {
    return {
      id: node.id,
      title: node.title,
      // 자식들도 재귀적으로 변환
      children: node.children.map(toClientNode),
    };
  }

  // 루트 노드들을 변환하여 반환
  return tree.children.map(toClientNode);
}
