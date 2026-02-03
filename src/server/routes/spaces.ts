/**
 * @file Spaces 라우터
 * @description Confluence Space 관련 API 엔드포인트 정의
 *
 * 엔드포인트:
 * - GET /api/spaces - 전체 Space 목록 조회
 * - GET /api/spaces/:id/pages - 특정 Space의 페이지 목록 조회
 * - GET /api/spaces/:id/tree - 특정 Space의 페이지 트리 조회
 *
 * 캐싱 전략:
 * - 서버 메모리에 페이지 데이터 캐시 (5분 TTL)
 * - ?refresh=true 쿼리로 캐시 우회 가능
 * - clearSpaceCache() 함수로 수동 무효화 가능
 */

import { Router, Request, Response } from 'express';
import { getConfluenceClient } from '../services/confluenceClient.js';
import { buildTree, getTreeStats, toClientTree } from '../services/treeBuilder.js';
import { setupLogger } from '../utils/logger.js';

// 모듈 전용 로거
const logger = setupLogger('routes_spaces');

// ===== 캐시 설정 =====

/**
 * 페이지 캐시 저장소
 *
 * @description
 * Map<SpaceID, CacheEntry> 형태로 저장
 * 각 Space별로 페이지 배열과 메타데이터를 캐싱
 *
 * 캐시 항목 구조:
 * - pages: 페이지 배열
 * - spaceName: Space 이름
 * - timestamp: 캐시 생성 시간 (TTL 계산용)
 */
const pagesCache = new Map<string, { pages: any[]; spaceName: string; timestamp: number }>();

/** 캐시 유효 시간 (5분) */
const CACHE_TTL = 5 * 60 * 1000;

/**
 * 특정 Space의 캐시 삭제
 *
 * @param {string} spaceId - 삭제할 Space ID
 *
 * @description
 * 페이지 삭제 후 등 데이터 변경 시 호출
 * 다른 라우터(pages.ts)에서 import하여 사용
 *
 * @example
 * clearSpaceCache('123456'); // 삭제 후 캐시 무효화
 */
export function clearSpaceCache(spaceId: string): void {
  pagesCache.delete(spaceId);
}

/**
 * Spaces 라우터 생성 함수
 *
 * @returns {Router} Express 라우터 인스턴스
 *
 * @description
 * 팩토리 패턴: 라우터 인스턴스를 생성하여 반환
 * 각 엔드포인트 핸들러를 등록
 */
export function createSpacesRouter(): Router {
  const router = Router();

  // ===== GET /api/spaces =====

  /**
   * 전체 Space 목록 조회
   *
   * @description
   * Confluence의 모든 Space를 가져옴
   * 캐싱 없음 (Space 목록은 자주 변경되지 않음)
   *
   * @response {{ spaces: Space[] }}
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const client = getConfluenceClient();
      const spaces = await client.getSpaces();
      res.json({ spaces });
    } catch (error) {
      logger.error('Failed to get spaces:', error);
      res.status(500).json({ message: 'Failed to fetch spaces' });
    }
  });

  // ===== GET /api/spaces/:id/pages =====

  /**
   * 특정 Space의 페이지 목록 조회
   *
   * @param {string} id - Space ID (URL 파라미터)
   * @query {boolean} refresh - 캐시 우회 여부
   *
   * @description
   * 1. 캐시 확인 (refresh=true면 건너뜀)
   * 2. 캐시 히트 시 즉시 반환
   * 3. 캐시 미스 시 API 호출 후 캐시 저장
   *
   * @response {{ pages: Page[] }}
   */
  router.get('/:id/pages', async (req: Request, res: Response) => {
    try {
      const spaceId = req.params.id;
      // 쿼리 파라미터에서 refresh 플래그 확인
      const refresh = req.query.refresh === 'true';
      const client = getConfluenceClient();

      // 캐시 확인 (refresh 요청이 아닐 때만)
      const cached = pagesCache.get(spaceId);
      if (!refresh && cached && Date.now() - cached.timestamp < CACHE_TTL) {
        // 캐시 히트: 캐시된 데이터 반환
        return res.json({ pages: cached.pages });
      }

      // 캐시 미스 또는 refresh 요청: API 호출
      const pages = await client.getPagesFromSpace(spaceId);

      // 캐시 저장 (Space 이름도 함께 저장)
      const spaces = await client.getSpaces();
      const space = spaces.find((s) => s.id === spaceId);
      pagesCache.set(spaceId, {
        pages,
        spaceName: space?.name || '',
        timestamp: Date.now(),
      });

      res.json({ pages });
    } catch (error) {
      logger.error('Failed to get pages:', error);
      res.status(500).json({ message: 'Failed to fetch pages' });
    }
  });

  // ===== GET /api/spaces/:id/tree =====

  /**
   * 특정 Space의 페이지 트리 조회
   *
   * @param {string} id - Space ID (URL 파라미터)
   * @query {boolean} refresh - 캐시 우회 여부
   *
   * @description
   * 페이지 데이터를 트리 구조로 변환하여 반환
   * 통계 정보(totalPages, rootPages, maxDepth)도 함께 반환
   *
   * 처리 과정:
   * 1. 캐시에서 페이지 데이터 확인
   * 2. buildTree()로 트리 구조 생성
   * 3. getTreeStats()로 통계 계산
   * 4. toClientTree()로 클라이언트용 간소화
   *
   * @response {{ tree: TreeNode[], stats: TreeStats }}
   */
  router.get('/:id/tree', async (req: Request, res: Response) => {
    try {
      const spaceId = req.params.id;
      const refresh = req.query.refresh === 'true';
      const client = getConfluenceClient();

      // 캐시 확인
      let pages: any[];
      let spaceName: string;

      const cached = pagesCache.get(spaceId);
      if (!refresh && cached && Date.now() - cached.timestamp < CACHE_TTL) {
        // 캐시 히트
        pages = cached.pages;
        spaceName = cached.spaceName;
      } else {
        // 캐시 미스: API 호출 및 캐시 갱신
        pages = await client.getPagesFromSpace(spaceId);
        const spaces = await client.getSpaces();
        const space = spaces.find((s) => s.id === spaceId);
        spaceName = space?.name || '';

        pagesCache.set(spaceId, {
          pages,
          spaceName,
          timestamp: Date.now(),
        });
      }

      // 트리 구조 생성
      const tree = buildTree(pages, spaceId, spaceName);

      // 통계 계산
      const stats = getTreeStats(tree);

      // 클라이언트용 간소화 (불필요한 필드 제거)
      const clientTree = toClientTree(tree);

      res.json({
        tree: clientTree,
        stats: {
          totalPages: stats.totalPages,
          rootPages: stats.rootPages,
          maxDepth: stats.maxDepth,
        },
      });
    } catch (error) {
      logger.error('Failed to get tree:', error);
      res.status(500).json({ message: 'Failed to build tree' });
    }
  });

  return router;
}
