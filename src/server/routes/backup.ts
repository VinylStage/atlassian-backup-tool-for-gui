import { Router, Request, Response } from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';
import archiver from 'archiver';
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

  // POST /api/backup/download - Download backup as ZIP file
  router.post('/download', async (req: Request, res: Response) => {
    try {
      const { spaceId, spaceName, formats, level, targetIds } = req.body as {
        spaceId: string;
        spaceName?: string;
        formats: { html?: boolean; md?: boolean; pdf?: boolean };
        level?: BackupLevel;
        targetIds?: string[];
      };

      if (!spaceId) {
        return res.status(400).json({ message: 'spaceId is required' });
      }

      if (!formats || (!formats.html && !formats.md && !formats.pdf)) {
        return res.status(400).json({ message: 'At least one format must be selected' });
      }

      // For folder/page level, targetIds is required
      if ((level === 'folder' || level === 'page') && (!targetIds || targetIds.length === 0)) {
        return res.status(400).json({ message: 'targetIds is required for folder/page level backup' });
      }

      logger.info(`Starting download backup for space ${spaceId}, level ${level || 'space'}`);

      // Fetch pages
      const client = getConfluenceClient();
      let pages = await client.getPagesFromSpace(spaceId);

      // Filter pages based on level and targetIds
      if ((level === 'folder' || level === 'page') && targetIds) {
        const targetIdSet = new Set(targetIds);
        pages = pages.filter(page => targetIdSet.has(page.id));
        logger.info(`Filtered to ${pages.length} pages based on targetIds`);
      }

      // Create temp directory for backup
      const tempDir = path.join(os.tmpdir(), 'confluence-backup', `${spaceId}_${Date.now()}`);
      ensureDir(tempDir);

      try {
        // Convert pages with specified formats
        const result = await convertPages(pages, tempDir, spaceName || '', {
          html: formats.html,
          markdown: formats.md,
          pdf: formats.pdf,
        });

        logger.info(
          `Conversion complete: ${result.pagesProcessed} pages, ` +
          `${result.htmlCount} HTML, ${result.mdCount} MD, ${result.pdfCount} PDF`
        );

        // Create ZIP file
        const safeSpaceName = safeFilename(spaceName || '');
        const zipFilename = safeSpaceName
          ? `${spaceId}_${safeSpaceName}.zip`
          : `${spaceId}_backup.zip`;
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

        fileStream.on('error', (err) => {
          logger.error('Error streaming ZIP file:', err);
          fs.rm(tempDir, { recursive: true, force: true }, () => {});
          fs.unlink(zipPath, () => {});
        });
      } catch (convError) {
        // Cleanup on error
        fs.rm(tempDir, { recursive: true, force: true }, () => {});
        throw convError;
      }
    } catch (error) {
      logger.error('Download backup failed:', error);
      res.status(500).json({
        message: error instanceof Error ? error.message : 'Download failed',
      });
    }
  });

  return router;
}
