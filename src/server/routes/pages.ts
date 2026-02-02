import { Router, Request, Response } from 'express';
import { getConfluenceClient } from '../services/confluenceClient.js';
import { getPagePreview } from '../services/parser.js';
import { setupLogger } from '../utils/logger.js';

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

  return router;
}
