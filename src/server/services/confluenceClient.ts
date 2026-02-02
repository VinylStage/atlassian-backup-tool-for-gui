import axios, { AxiosInstance } from 'axios';
import { config } from '../config.js';
import { setupLogger } from '../utils/logger.js';
import type {
  Space,
  Page,
  ConfluenceSpacesResponse,
  ConfluencePagesResponse,
} from '../types/confluence.js';

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
}

let clientInstance: ConfluenceClient | null = null;

export function getConfluenceClient(): ConfluenceClient {
  if (!clientInstance) {
    clientInstance = new ConfluenceClient();
  }
  return clientInstance;
}
