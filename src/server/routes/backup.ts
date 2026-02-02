import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { getConfluenceClient } from '../services/confluenceClient.js';
import { parsePages, ParseResults } from '../services/parser.js';
import { config } from '../config.js';
import { setupLogger } from '../utils/logger.js';

const logger = setupLogger('routes_backup');

type BackupFormat = 'html' | 'markdown' | 'pdf' | 'html+md' | 'html+pdf' | 'md+pdf' | 'all';
type BackupLevel = 'space' | 'folder' | 'page';

interface BackupRequest {
  spaceId: string;
  spaceName: string;
  format: BackupFormat;
  level: BackupLevel;
  targetIds?: string[];  // Required when level is 'folder' or 'page'
}

// Map new format options to internal format for parsePages
function mapFormat(format: BackupFormat): 'html' | 'markdown' | 'pdf' | 'both' | 'all' {
  switch (format) {
    case 'html':
      return 'html';
    case 'markdown':
      return 'markdown';
    case 'pdf':
      return 'pdf';
    case 'html+md':
      return 'both';
    case 'html+pdf':
    case 'md+pdf':
    case 'all':
      return 'all';
    default:
      return 'markdown';
  }
}

export function createBackupRouter(): Router {
  const router = Router();

  // POST /api/backup - Start backup
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { spaceId, spaceName, format, level, targetIds } = req.body as BackupRequest;

      if (!spaceId || !format) {
        return res.status(400).json({ message: 'spaceId and format are required' });
      }

      const validFormats: BackupFormat[] = ['html', 'markdown', 'pdf', 'html+md', 'html+pdf', 'md+pdf', 'all'];
      if (!validFormats.includes(format)) {
        return res.status(400).json({ message: 'Invalid format' });
      }

      const validLevels: BackupLevel[] = ['space', 'folder', 'page'];
      if (level && !validLevels.includes(level)) {
        return res.status(400).json({ message: 'Invalid level' });
      }

      // For folder/page level, targetIds is required
      if ((level === 'folder' || level === 'page') && (!targetIds || targetIds.length === 0)) {
        return res.status(400).json({ message: 'targetIds is required for folder/page level backup' });
      }

      logger.info(`Starting backup for space ${spaceId} with format ${format}, level ${level || 'space'}`);

      // Fetch pages
      const client = getConfluenceClient();
      let pages = await client.getPagesFromSpace(spaceId);

      // Filter pages based on level and targetIds
      if (level === 'folder' || level === 'page') {
        const targetIdSet = new Set(targetIds);
        pages = pages.filter(page => targetIdSet.has(page.id));
        logger.info(`Filtered to ${pages.length} pages based on targetIds`);
      }

      // Save raw JSON
      const rawJsonPath = path.join(config.dataDir, `pages_from_space_${spaceId}.json`);
      if (!fs.existsSync(config.dataDir)) {
        fs.mkdirSync(config.dataDir, { recursive: true });
      }
      fs.writeFileSync(rawJsonPath, JSON.stringify(pages, null, 2), 'utf-8');
      logger.info(`Saved raw JSON to ${rawJsonPath}`);

      // Parse and convert
      const outputRoot = path.join(config.dataDir, `space_${spaceId}`);

      // Handle special format combinations
      let results: ParseResults = {};
      const internalFormat = mapFormat(format);

      if (format === 'html+pdf') {
        // HTML + PDF only (no markdown)
        const htmlResults = await parsePages(pages, outputRoot, 'html', spaceName || '');
        const pdfResults = await parsePages(pages, outputRoot, 'pdf', spaceName || '');
        results = {
          html: htmlResults.html,
          pdf: pdfResults.pdf,
        };
      } else if (format === 'md+pdf') {
        // Markdown + PDF only (no html)
        const mdResults = await parsePages(pages, outputRoot, 'markdown', spaceName || '');
        const pdfResults = await parsePages(pages, outputRoot, 'pdf', spaceName || '');
        results = {
          markdown: mdResults.markdown,
          pdf: pdfResults.pdf,
        };
      } else {
        results = await parsePages(pages, outputRoot, internalFormat, spaceName || '');
      }

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
