import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { getConfluenceClient } from '../services/confluenceClient.js';
import { parsePages } from '../services/parser.js';
import { config } from '../config.js';
import { setupLogger } from '../utils/logger.js';

const logger = setupLogger('routes_backup');

interface BackupRequest {
  spaceId: string;
  spaceName: string;
  format: 'html' | 'markdown' | 'pdf' | 'both' | 'all';
}

export function createBackupRouter(): Router {
  const router = Router();

  // POST /api/backup - Start backup
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { spaceId, spaceName, format } = req.body as BackupRequest;

      if (!spaceId || !format) {
        return res.status(400).json({ message: 'spaceId and format are required' });
      }

      const validFormats = ['html', 'markdown', 'pdf', 'both', 'all'];
      if (!validFormats.includes(format)) {
        return res.status(400).json({ message: 'Invalid format' });
      }

      logger.info(`Starting backup for space ${spaceId} with format ${format}`);

      // Fetch pages
      const client = getConfluenceClient();
      const pages = await client.getPagesFromSpace(spaceId);

      // Save raw JSON
      const rawJsonPath = path.join(config.dataDir, `pages_from_space_${spaceId}.json`);
      if (!fs.existsSync(config.dataDir)) {
        fs.mkdirSync(config.dataDir, { recursive: true });
      }
      fs.writeFileSync(rawJsonPath, JSON.stringify(pages, null, 2), 'utf-8');
      logger.info(`Saved raw JSON to ${rawJsonPath}`);

      // Parse and convert
      const outputRoot = path.join(config.dataDir, `space_${spaceId}`);
      const results = await parsePages(pages, outputRoot, format, spaceName || '');

      res.json({
        success: true,
        outputPath: outputRoot,
        results,
      });
    } catch (error) {
      logger.error('Backup failed:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Backup failed',
      });
    }
  });

  return router;
}
