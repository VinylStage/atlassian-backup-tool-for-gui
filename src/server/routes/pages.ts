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

const logger = setupLogger('routes_pages');

// Simple page cache
const pageCache = new Map<string, { page: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function createPagesRouter(): Router {
  const router = Router();

  // GET /api/pages/:id/preview - Get page preview (HTML and Markdown)
  router.get('/:id/preview', async (req: Request, res: Response) => {
    try {
      const pageId = req.params.id;

      // Check cache
      const cached = pageCache.get(pageId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        const preview = getPagePreview(cached.page);
        return res.json(preview);
      }

      // Need to find the page from a space
      // This is a simplified version - in production you'd want a better lookup
      const client = getConfluenceClient();
      const spaces = await client.getSpaces();

      for (const space of spaces) {
        const pages = await client.getPagesFromSpace(space.id);
        const page = pages.find((p) => p.id === pageId);

        if (page) {
          pageCache.set(pageId, { page, timestamp: Date.now() });
          const preview = getPagePreview(page);
          return res.json(preview);
        }
      }

      res.status(404).json({ message: 'Page not found' });
    } catch (error) {
      logger.error('Failed to get page preview:', error);
      res.status(500).json({ message: 'Failed to get page preview' });
    }
  });

  // POST /api/pages/:id/download - Download single page as ZIP
  router.post('/:id/download', async (req: Request, res: Response) => {
    try {
      const pageId = req.params.id;
      const { formats, spaceName } = req.body as {
        formats: { html?: boolean; md?: boolean; pdf?: boolean };
        spaceName?: string;
      };

      if (!formats || (!formats.html && !formats.md && !formats.pdf)) {
        return res.status(400).json({ message: 'At least one format must be selected' });
      }

      // Find the page
      const client = getConfluenceClient();
      let foundPage: any = null;
      let foundSpaceName = spaceName || '';

      // Check cache first
      const cached = pageCache.get(pageId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        foundPage = cached.page;
      } else {
        // Search for the page
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

      // Create temp directory for conversion
      const tempDir = path.join(os.tmpdir(), 'confluence-download', `${pageId}_${Date.now()}`);
      ensureDir(tempDir);

      try {
        // Convert the single page
        await convertPages(
          [foundPage],
          tempDir,
          foundSpaceName,
          { html: formats.html, markdown: formats.md, pdf: formats.pdf }
        );

        // Create ZIP file
        const zipFilename = `${pageId}_${safeFilename(foundPage.title)}.zip`;
        const zipPath = path.join(os.tmpdir(), zipFilename);

        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        archive.pipe(output);
        archive.directory(tempDir, false);

        await new Promise<void>((resolve, reject) => {
          output.on('close', resolve);
          archive.on('error', reject);
          archive.finalize();
        });

        // Send ZIP file
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
        const fileStream = fs.createReadStream(zipPath);
        fileStream.pipe(res);

        // Cleanup after sending
        fileStream.on('end', () => {
          fs.rm(tempDir, { recursive: true, force: true }, () => {});
          fs.unlink(zipPath, () => {});
        });
      } catch (convError) {
        // Cleanup on error
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

  // DELETE /api/pages/:id - Delete single page
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const pageId = req.params.id;
      const client = getConfluenceClient();

      await client.deletePage(pageId);

      // Clear cache for this page
      pageCache.delete(pageId);

      res.json({ success: true, message: `Page ${pageId} deleted successfully` });
    } catch (error) {
      logger.error('Failed to delete page:', error);
      res.status(500).json({
        message: error instanceof Error ? error.message : 'Failed to delete page',
      });
    }
  });

  // POST /api/pages/bulk-delete - Delete multiple pages
  router.post('/bulk-delete', async (req: Request, res: Response) => {
    try {
      const { pageIds, includeChildren, spaceId } = req.body as {
        pageIds: string[];
        includeChildren?: boolean;
        spaceId?: string;
      };

      if (!pageIds || !Array.isArray(pageIds) || pageIds.length === 0) {
        return res.status(400).json({ message: 'pageIds array is required' });
      }

      const client = getConfluenceClient();
      const results: { pageId: string; success: boolean; error?: string }[] = [];
      const allPageIds = new Set<string>(pageIds);

      // If includeChildren, get all descendant pages first
      if (includeChildren) {
        for (const pageId of pageIds) {
          try {
            const descendants = await client.getDescendantPageIds(pageId);
            descendants.forEach((id) => allPageIds.add(id));
          } catch (error) {
            logger.warn(`Failed to get descendants for page ${pageId}:`, error);
          }
        }
      }

      // Delete pages in reverse order (children first) to avoid dependency issues
      const pageIdsArray = Array.from(allPageIds);

      for (const pageId of pageIdsArray) {
        try {
          await client.deletePage(pageId);
          pageCache.delete(pageId);
          results.push({ pageId, success: true });
        } catch (error) {
          results.push({
            pageId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Clear space cache so next refresh gets fresh data
      if (spaceId) {
        clearSpaceCache(spaceId);
      }

      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;

      res.json({
        success: failCount === 0,
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
