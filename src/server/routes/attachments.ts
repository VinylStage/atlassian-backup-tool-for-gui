import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { getConfluenceClient } from '../services/confluenceClient.js';
import { config } from '../config.js';
import { setupLogger } from '../utils/logger.js';

const logger = setupLogger('routes_attachments');

export function createAttachmentsRouter(): Router {
  const router = Router();

  /**
   * GET /api/attachments/:pageId/:filename
   * Serve attachment file - downloads from Confluence if not cached locally
   */
  router.get('/:pageId/:filename', async (req: Request, res: Response) => {
    try {
      const { pageId, filename } = req.params;
      const decodedFilename = decodeURIComponent(filename);

      // Check local cache first
      const cacheDir = path.join(config.dataDir, 'attachments', pageId);
      const cachePath = path.join(cacheDir, decodedFilename);

      if (fs.existsSync(cachePath)) {
        logger.info(`Serving cached attachment: ${cachePath}`);
        return res.sendFile(cachePath);
      }

      // Download from Confluence
      logger.info(`Downloading attachment ${decodedFilename} for page ${pageId}`);
      const client = getConfluenceClient();
      const attachments = await client.getAttachments(pageId);

      const attachment = attachments.find(a => a.title === decodedFilename);
      if (!attachment) {
        return res.status(404).json({ message: 'Attachment not found' });
      }

      // Download and cache
      const result = await client.downloadAttachments(pageId, cacheDir);
      if (result.downloaded === 0 && result.failed > 0) {
        return res.status(500).json({ message: 'Failed to download attachment' });
      }

      // Serve the downloaded file
      if (fs.existsSync(cachePath)) {
        res.setHeader('Content-Type', attachment.mediaType);
        return res.sendFile(cachePath);
      }

      res.status(404).json({ message: 'Attachment not found after download' });
    } catch (error) {
      logger.error('Failed to serve attachment:', error);
      res.status(500).json({
        message: error instanceof Error ? error.message : 'Failed to serve attachment',
      });
    }
  });

  /**
   * GET /api/attachments/:pageId
   * List attachments for a page
   */
  router.get('/:pageId', async (req: Request, res: Response) => {
    try {
      const { pageId } = req.params;
      const client = getConfluenceClient();
      const attachments = await client.getAttachments(pageId);

      res.json({ attachments });
    } catch (error) {
      logger.error('Failed to list attachments:', error);
      res.status(500).json({
        message: error instanceof Error ? error.message : 'Failed to list attachments',
      });
    }
  });

  return router;
}
