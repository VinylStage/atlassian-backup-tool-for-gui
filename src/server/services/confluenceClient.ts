import axios, { AxiosInstance } from 'axios';
import path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { config } from '../config.js';
import { setupLogger } from '../utils/logger.js';
import { ensureDir } from '../utils/fileUtils.js';
import type {
  Space,
  Page,
  ConfluenceSpacesResponse,
  ConfluencePagesResponse,
} from '../types/confluence.js';

export interface Attachment {
  id: string;
  title: string;
  downloadLink: string;
  mediaType: string;
  fileSize: number;
}

const logger = setupLogger('confluence_client');

export class ConfluenceClient {
  private client: AxiosInstance;

  constructor() {
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');

    this.client = axios.create({
      baseURL: `https://${config.domain}/wiki/api/v2`,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          logger.error(
            `API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`
          );
        } else {
          logger.error(`Network Error: ${error.message}`);
        }
        throw error;
      }
    );
  }

  async getSpaces(): Promise<Space[]> {
    logger.info('Fetching all spaces...');
    const spaces: Space[] = [];
    let cursor: string | null = null;

    do {
      const params: Record<string, string | number> = { limit: 250 };
      if (cursor) params.cursor = cursor;

      const response = await this.client.get<ConfluenceSpacesResponse>('/spaces', {
        params,
      });

      for (const item of response.data.results) {
        spaces.push({
          id: String(item.id),
          name: item.name,
          key: item.key,
        });
      }

      cursor = response.data._links?.next
        ? new URL(response.data._links.next, `https://${config.domain}`).searchParams.get(
            'cursor'
          )
        : null;
    } while (cursor);

    logger.info(`Found ${spaces.length} spaces.`);
    return spaces;
  }

  async getPagesFromSpace(spaceId: string, bodyFormat = 'storage'): Promise<Page[]> {
    logger.info(`Fetching pages from space ${spaceId}...`);
    const pages: Page[] = [];
    let cursor: string | null = null;

    do {
      const params: Record<string, string | number> = {
        'space-id': spaceId,
        'body-format': bodyFormat,
        limit: 250,
      };
      if (cursor) params.cursor = cursor;

      const response = await this.client.get<ConfluencePagesResponse>('/pages', {
        params,
      });

      for (const item of response.data.results) {
        pages.push({
          id: String(item.id),
          title: item.title,
          spaceId: String(item.spaceId),
          parentId: item.parentId ? String(item.parentId) : null,
          parentType: item.parentType === 'page' ? 'page' : 'space',
          status: item.status,
          createdAt: item.createdAt,
          body: item.body,
        });
      }

      cursor = response.data._links?.next
        ? new URL(response.data._links.next, `https://${config.domain}`).searchParams.get(
            'cursor'
          )
        : null;
    } while (cursor);

    logger.info(`Found ${pages.length} pages in space ${spaceId}.`);
    return pages;
  }

  /**
   * Get attachments for a specific page
   * Uses Confluence REST API v1 as v2 doesn't support attachments endpoint
   */
  async getAttachments(pageId: string): Promise<Attachment[]> {
    logger.info(`Fetching attachments for page ${pageId}...`);
    const attachments: Attachment[] = [];

    try {
      const response = await this.client.get(`/content/${pageId}/child/attachment`, {
        baseURL: `https://${config.domain}/wiki/rest/api`,
        params: { limit: 100 },
      });

      for (const item of response.data.results) {
        attachments.push({
          id: item.id,
          title: item.title,
          downloadLink: item._links?.download || '',
          mediaType: item.metadata?.mediaType || 'application/octet-stream',
          fileSize: item.extensions?.fileSize || 0,
        });
      }

      logger.info(`Found ${attachments.length} attachments for page ${pageId}.`);
    } catch (error) {
      logger.warn(`Failed to fetch attachments for page ${pageId}: ${error}`);
    }

    return attachments;
  }

  /**
   * Download all attachments for a page to a local directory
   * @param pageId - The page ID
   * @param outputDir - Directory to save attachments (e.g., 'data/{space}/pages/{pageId}/attachments')
   * @returns Object with counts of downloaded and failed files
   */
  async downloadAttachments(
    pageId: string,
    outputDir: string
  ): Promise<{ downloaded: number; failed: number }> {
    const attachments = await this.getAttachments(pageId);

    if (attachments.length === 0) {
      return { downloaded: 0, failed: 0 };
    }

    ensureDir(outputDir);

    let downloaded = 0;
    let failed = 0;

    for (const attachment of attachments) {
      if (!attachment.downloadLink) {
        logger.warn(`No download link for attachment: ${attachment.title}`);
        failed++;
        continue;
      }

      const filePath = path.join(outputDir, attachment.title);

      try {
        // Download using full URL with authentication
        const downloadUrl = `https://${config.domain}/wiki${attachment.downloadLink}`;
        const response = await this.client.get(downloadUrl, {
          baseURL: '', // Override baseURL for direct download
          responseType: 'stream',
        });

        await pipeline(response.data, createWriteStream(filePath));
        downloaded++;
        logger.info(`Downloaded: ${attachment.title}`);
      } catch (error) {
        logger.warn(`Failed to download ${attachment.title}: ${error}`);
        failed++;
      }
    }

    return { downloaded, failed };
  }
}

let clientInstance: ConfluenceClient | null = null;

export function getConfluenceClient(): ConfluenceClient {
  if (!clientInstance) {
    clientInstance = new ConfluenceClient();
  }
  return clientInstance;
}
