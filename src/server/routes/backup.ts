import { Router, Request, Response } from 'express';
import path from 'path';
import { getConfluenceClient } from '../services/confluenceClient.js';
import { convertPages, ConvertResult } from '../services/parser.js';
import { config } from '../config.js';
import { setupLogger } from '../utils/logger.js';
import { safeFilename, ensureDir } from '../utils/fileUtils.js';

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

// Map format string to format flags
function parseFormats(format: BackupFormat): { html: boolean; markdown: boolean; pdf: boolean } {
  switch (format) {
    case 'html':
      return { html: true, markdown: false, pdf: false };
    case 'markdown':
      return { html: false, markdown: true, pdf: false };
    case 'pdf':
      return { html: false, markdown: false, pdf: true };
    case 'html+md':
      return { html: true, markdown: true, pdf: false };
    case 'html+pdf':
      return { html: true, markdown: false, pdf: true };
    case 'md+pdf':
      return { html: false, markdown: true, pdf: true };
    case 'all':
      return { html: true, markdown: true, pdf: true };
    default:
      return { html: false, markdown: true, pdf: false };
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

      // Create output directory: {SPACE_ID}_{SPACE_NAME}
      const safeSpaceName = safeFilename(spaceName || '');
      const outputDirName = safeSpaceName
        ? `${spaceId}_${safeSpaceName}`
        : spaceId;
      const outputRoot = path.join(config.dataDir, outputDirName);
      ensureDir(outputRoot);

      logger.info(`Output directory: ${outputRoot}`);

      // Convert pages with specified formats
      const formats = parseFormats(format);
      const result: ConvertResult = await convertPages(pages, outputRoot, spaceName || '', formats);

      logger.info(
        `Backup complete: ${result.pagesProcessed} pages, ` +
        `${result.htmlCount} HTML, ${result.mdCount} MD, ${result.pdfCount} PDF, ` +
        `${result.attachmentsDownloaded} attachments`
      );

      res.json({
        success: true,
        outputPath: outputRoot,
        results: {
          pagesProcessed: result.pagesProcessed,
          html: result.htmlCount,
          markdown: result.mdCount,
          pdf: result.pdfCount,
        },
        attachments: {
          downloaded: result.attachmentsDownloaded,
          failed: result.attachmentsFailed,
        },
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
