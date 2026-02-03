/**
 * @file Pages 라우터
 * @description 개별 페이지 관련 API 엔드포인트 정의
 *
 * 엔드포인트:
 * - GET /api/pages/:id/preview - 페이지 미리보기 (HTML + Markdown)
 * - POST /api/pages/:id/download - 단일 페이지 다운로드 (ZIP)
 * - DELETE /api/pages/:id - 단일 페이지 삭제
 * - POST /api/pages/bulk-delete - 다중 페이지 일괄 삭제
 *
 * 캐싱:
 * - 개별 페이지 캐시 (5분 TTL)
 * - 삭제 시 관련 캐시 무효화
 */

import { Router, Request, Response } from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';
import archiver from 'archiver';
import { getConfluenceClient } from '../services/confluenceClient.js';
import { getPagePreview, convertPages } from '../services/parser.js';
import { setupLogger } from '../utils/logger.js';
import { safeFilename, ensureDir } from '../utils/fileUtils.js';
import { clearSpaceCache } from './spaces.js';

// 모듈 전용 로거
const logger = setupLogger('routes_pages');

// ===== 캐시 설정 =====

/**
 * 개별 페이지 캐시
 *
 * @description
 * Map<PageID, CacheEntry> 형태
 * 페이지 미리보기와 다운로드에서 사용
 */
const pageCache = new Map<string, { page: any; timestamp: number }>();

/** 캐시 유효 시간 (5분) */
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Pages 라우터 생성 함수
 *
 * @returns {Router} Express 라우터 인스턴스
 */
export function createPagesRouter(): Router {
  const router = Router();

  // ===== GET /api/pages/:id/preview =====

  /**
   * 페이지 미리보기 데이터 조회
   *
   * @param {string} id - 페이지 ID
   * @returns {{ html: string, markdown: string }}
   *
   * @description
   * Confluence storage format을 HTML과 Markdown으로 변환하여 반환
   *
   * 처리 과정:
   * 1. 캐시 확인
   * 2. 캐시 미스 시 전체 Space를 순회하며 페이지 찾기
   * 3. getPagePreview()로 변환 후 반환
   */
  router.get('/:id/preview', async (req: Request, res: Response) => {
    try {
      const pageId = req.params.id;

      // 캐시 확인
      const cached = pageCache.get(pageId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        // 캐시 히트: 변환 후 반환
        const preview = getPagePreview(cached.page);
        return res.json(preview);
      }

      // 캐시 미스: 페이지 찾기
      // 참고: 실제 프로덕션에서는 더 효율적인 조회 방법 필요
      const client = getConfluenceClient();
      const spaces = await client.getSpaces();

      // 모든 Space를 순회하며 페이지 찾기
      for (const space of spaces) {
        const pages = await client.getPagesFromSpace(space.id);
        const page = pages.find((p) => p.id === pageId);

        if (page) {
          // 페이지 발견: 캐시 저장 후 반환
          pageCache.set(pageId, { page, timestamp: Date.now() });
          const preview = getPagePreview(page);
          return res.json(preview);
        }
      }

      // 페이지를 찾지 못함
      res.status(404).json({ message: 'Page not found' });
    } catch (error) {
      logger.error('Failed to get page preview:', error);
      res.status(500).json({ message: 'Failed to get page preview' });
    }
  });

  // ===== POST /api/pages/:id/download =====

  /**
   * 단일 페이지 ZIP 다운로드
   *
   * @param {string} id - 페이지 ID
   * @body {{ formats: { html?: boolean, md?: boolean, pdf?: boolean }, spaceName?: string }}
   *
   * @description
   * 선택된 포맷으로 페이지를 변환하고 ZIP으로 압축하여 반환
   *
   * 처리 과정:
   * 1. 요청 유효성 검사
   * 2. 페이지 찾기 (캐시 → API)
   * 3. 임시 디렉토리에 변환
   * 4. ZIP 압축
   * 5. 스트림으로 응답 전송
   * 6. 임시 파일 정리
   */
  router.post('/:id/download', async (req: Request, res: Response) => {
    try {
      const pageId = req.params.id;
      const { formats, spaceName } = req.body as {
        formats: { html?: boolean; md?: boolean; pdf?: boolean };
        spaceName?: string;
      };

      // 포맷 선택 검사
      if (!formats || (!formats.html && !formats.md && !formats.pdf)) {
        return res.status(400).json({ message: 'At least one format must be selected' });
      }

      // 페이지 찾기
      const client = getConfluenceClient();
      let foundPage: any = null;
      let foundSpaceName = spaceName || '';

      // 캐시 확인
      const cached = pageCache.get(pageId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        foundPage = cached.page;
      } else {
        // 캐시 미스: 전체 Space 순회
        const spaces = await client.getSpaces();
        for (const space of spaces) {
          const pages = await client.getPagesFromSpace(space.id);
          const page = pages.find((p) => p.id === pageId);
          if (page) {
            foundPage = page;
            foundSpaceName = foundSpaceName || space.name || '';
            pageCache.set(pageId, { page, timestamp: Date.now() });
            break;
          }
        }
      }

      if (!foundPage) {
        return res.status(404).json({ message: 'Page not found' });
      }

      // 임시 디렉토리 생성 (OS 기본 temp + 타임스탬프)
      const tempDir = path.join(os.tmpdir(), 'confluence-download', `${pageId}_${Date.now()}`);
      ensureDir(tempDir);

      try {
        // 페이지 변환 (HTML/MD/PDF)
        await convertPages(
          [foundPage],
          tempDir,
          foundSpaceName,
          { html: formats.html, markdown: formats.md, pdf: formats.pdf }
        );

        // ZIP 파일 생성
        const zipFilename = `${pageId}_${safeFilename(foundPage.title)}.zip`;
        const zipPath = path.join(os.tmpdir(), zipFilename);

        // archiver로 ZIP 압축
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } }); // 최대 압축

        archive.pipe(output);
        archive.directory(tempDir, false); // 폴더 구조 없이 파일만

        // 압축 완료 대기
        await new Promise<void>((resolve, reject) => {
          output.on('close', resolve);
          archive.on('error', reject);
          archive.finalize();
        });

        // ZIP 파일 전송
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
        const fileStream = fs.createReadStream(zipPath);
        fileStream.pipe(res);

        // 전송 완료 후 정리
        fileStream.on('end', () => {
          // 임시 파일 삭제 (비동기, 에러 무시)
          fs.rm(tempDir, { recursive: true, force: true }, () => {});
          fs.unlink(zipPath, () => {});
        });
      } catch (convError) {
        // 변환/압축 에러 시 정리
        fs.rm(tempDir, { recursive: true, force: true }, () => {});
        throw convError;
      }
    } catch (error) {
      logger.error('Failed to download page:', error);
      res.status(500).json({
        message: error instanceof Error ? error.message : 'Failed to download page',
      });
    }
  });

  // ===== DELETE /api/pages/:id =====

  /**
   * 단일 페이지 삭제
   *
   * @param {string} id - 페이지 ID
   *
   * @description
   * Confluence에서 페이지를 영구 삭제
   * 삭제 후 캐시에서도 제거
   *
   * 주의: 복구 불가능한 작업!
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const pageId = req.params.id;
      const client = getConfluenceClient();

      // Confluence API로 삭제
      await client.deletePage(pageId);

      // 캐시에서 제거
      pageCache.delete(pageId);

      res.json({ success: true, message: `Page ${pageId} deleted successfully` });
    } catch (error) {
      logger.error('Failed to delete page:', error);
      res.status(500).json({
        message: error instanceof Error ? error.message : 'Failed to delete page',
      });
    }
  });

  // ===== POST /api/pages/bulk-delete =====

  /**
   * 다중 페이지 일괄 삭제
   *
   * @body {{ pageIds: string[], includeChildren?: boolean, spaceId?: string }}
   *
   * @description
   * 여러 페이지를 한 번에 삭제
   * includeChildren=true 시 각 페이지의 모든 하위 페이지도 삭제
   *
   * 처리 과정:
   * 1. 요청 유효성 검사
   * 2. includeChildren이면 각 페이지의 자손 ID 수집
   * 3. 모든 대상 페이지 순차 삭제
   * 4. Space 캐시 무효화
   * 5. 결과 반환
   *
   * 삭제 순서: 특별한 순서 없음 (Confluence가 자동 처리)
   */
  router.post('/bulk-delete', async (req: Request, res: Response) => {
    try {
      const { pageIds, includeChildren, spaceId } = req.body as {
        pageIds: string[];
        includeChildren?: boolean;
        spaceId?: string;
      };

      // 요청 유효성 검사
      if (!pageIds || !Array.isArray(pageIds) || pageIds.length === 0) {
        return res.status(400).json({ message: 'pageIds array is required' });
      }

      const client = getConfluenceClient();
      const results: { pageId: string; success: boolean; error?: string }[] = [];

      // 삭제 대상 Set (중복 방지)
      const allPageIds = new Set<string>(pageIds);

      // 하위 페이지 포함 시 자손 수집
      if (includeChildren) {
        for (const pageId of pageIds) {
          try {
            // 재귀적으로 모든 자손 ID 가져오기
            const descendants = await client.getDescendantPageIds(pageId);
            descendants.forEach((id) => allPageIds.add(id));
          } catch (error) {
            // 자손 조회 실패는 경고만 (해당 페이지는 계속 삭제 시도)
            logger.warn(`Failed to get descendants for page ${pageId}:`, error);
          }
        }
      }

      // 순차 삭제 (병렬 삭제 시 API 제한에 걸릴 수 있음)
      const pageIdsArray = Array.from(allPageIds);

      for (const pageId of pageIdsArray) {
        try {
          await client.deletePage(pageId);
          pageCache.delete(pageId); // 캐시에서 제거
          results.push({ pageId, success: true });
        } catch (error) {
          // 개별 실패는 기록하고 계속 진행
          results.push({
            pageId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Space 캐시 무효화 (다음 조회 시 최신 데이터 반영)
      if (spaceId) {
        clearSpaceCache(spaceId);
      }

      // 결과 집계
      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;

      res.json({
        success: failCount === 0, // 모두 성공했을 때만 true
        message: `Deleted ${successCount} pages, ${failCount} failed`,
        results,
      });
    } catch (error) {
      logger.error('Failed to bulk delete pages:', error);
      res.status(500).json({
        message: error instanceof Error ? error.message : 'Failed to delete pages',
      });
    }
  });

  return router;
}
