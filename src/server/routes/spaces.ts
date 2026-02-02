import { Router, Request, Response } from 'express';
import { getConfluenceClient } from '../services/confluenceClient.js';
import { buildTree, getTreeStats, toClientTree } from '../services/treeBuilder.js';
import { setupLogger } from '../utils/logger.js';

const logger = setupLogger('routes_spaces');

// Store pages in memory for a session (simple cache)
const pagesCache = new Map<string, { pages: any[]; spaceName: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function createSpacesRouter(): Router {
  const router = Router();

  // GET /api/spaces - List all spaces
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

  // GET /api/spaces/:id/pages - Get pages from a space
  router.get('/:id/pages', async (req: Request, res: Response) => {
    try {
      const spaceId = req.params.id;
      const client = getConfluenceClient();

      // Check cache
      const cached = pagesCache.get(spaceId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return res.json({ pages: cached.pages });
      }

      const pages = await client.getPagesFromSpace(spaceId);

      // Cache the result
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

  // GET /api/spaces/:id/tree - Get tree structure
  router.get('/:id/tree', async (req: Request, res: Response) => {
    try {
      const spaceId = req.params.id;
      const client = getConfluenceClient();

      // Check cache
      let pages: any[];
      let spaceName: string;

      const cached = pagesCache.get(spaceId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        pages = cached.pages;
        spaceName = cached.spaceName;
      } else {
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

      const tree = buildTree(pages, spaceId, spaceName);
      const stats = getTreeStats(tree);
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
