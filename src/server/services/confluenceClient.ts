/**
 * @file Confluence API 클라이언트
 * @description Atlassian Confluence Cloud REST API와 통신하는 클래스
 *
 * 주요 기능:
 * - Space 목록 조회
 * - 페이지 목록 조회
 * - 첨부파일 조회 및 다운로드
 * - 페이지 삭제
 *
 * API 버전:
 * - 기본: Confluence REST API v2 (/wiki/api/v2)
 * - 첨부파일: REST API v1 (/wiki/rest/api) - v2에서 미지원
 */

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

/**
 * 첨부파일 정보 인터페이스
 */
export interface Attachment {
  id: string;           // 첨부파일 고유 ID
  title: string;        // 파일명
  downloadLink: string; // 다운로드 URL 경로
  mediaType: string;    // MIME 타입 (예: image/png)
  fileSize: number;     // 파일 크기 (bytes)
}

// 모듈 전용 로거 인스턴스
const logger = setupLogger('confluence_client');

/**
 * Confluence API 클라이언트 클래스
 *
 * @description
 * Atlassian Confluence Cloud API와 통신하기 위한 HTTP 클라이언트
 * Basic 인증 사용 (email + API 토큰)
 *
 * @example
 * const client = new ConfluenceClient();
 * const spaces = await client.getSpaces();
 */
export class ConfluenceClient {
  /** Axios HTTP 클라이언트 인스턴스 */
  private client: AxiosInstance;

  /**
   * ConfluenceClient 생성자
   *
   * @description
   * 1. Basic 인증 헤더 생성 (Base64 인코딩)
   * 2. Axios 인스턴스 설정
   * 3. 응답 인터셉터로 에러 로깅 설정
   */
  constructor() {
    // Basic 인증: "email:apiToken"을 Base64로 인코딩
    // Atlassian API는 이 형식의 인증을 요구함
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');

    // Axios 인스턴스 생성 및 기본 설정
    this.client = axios.create({
      baseURL: `https://${config.domain}/wiki/api/v2`, // Confluence API v2 기본 URL
      headers: {
        Authorization: `Basic ${auth}`,     // 인증 헤더
        'Content-Type': 'application/json', // 요청 본문 타입
        Accept: 'application/json',         // 응답 형식
      },
    });

    // 응답 인터셉터: API 에러를 로깅
    // 인터셉터는 모든 응답/에러를 가로채서 처리
    this.client.interceptors.response.use(
      (response) => response, // 성공 응답은 그대로 반환
      (error) => {
        // 에러 응답 로깅
        if (error.response) {
          // HTTP 에러 응답 (4xx, 5xx)
          logger.error(
            `API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`
          );
        } else {
          // 네트워크 에러 (연결 실패 등)
          logger.error(`Network Error: ${error.message}`);
        }
        throw error; // 에러를 다시 throw하여 호출자에게 전파
      }
    );
  }

  /**
   * 모든 Confluence Space 목록 조회
   *
   * @returns {Promise<Space[]>} Space 배열
   *
   * @description
   * 페이지네이션을 처리하여 모든 Space를 가져옴
   * Confluence API는 한 번에 최대 250개까지 반환
   *
   * @example
   * const spaces = await client.getSpaces();
   * // [{ id: '123', name: 'Engineering', key: 'ENG' }, ...]
   */
  async getSpaces(): Promise<Space[]> {
    logger.info('Fetching all spaces...');
    const spaces: Space[] = [];
    let cursor: string | null = null; // 페이지네이션 커서

    // 페이지네이션 루프: 더 이상 다음 페이지가 없을 때까지 반복
    do {
      // 쿼리 파라미터 설정
      const params: Record<string, string | number> = { limit: 250 };
      if (cursor) params.cursor = cursor; // 다음 페이지 커서

      // API 호출
      const response = await this.client.get<ConfluenceSpacesResponse>('/spaces', {
        params,
      });

      // 결과를 Space 배열에 추가
      for (const item of response.data.results) {
        spaces.push({
          id: String(item.id),   // ID를 문자열로 통일
          name: item.name,
          key: item.key,
        });
      }

      // 다음 페이지 커서 추출
      // _links.next가 있으면 URL에서 cursor 파라미터 추출
      cursor = response.data._links?.next
        ? new URL(response.data._links.next, `https://${config.domain}`).searchParams.get(
            'cursor'
          )
        : null;
    } while (cursor);

    logger.info(`Found ${spaces.length} spaces.`);
    return spaces;
  }

  /**
   * 특정 Space의 모든 페이지 조회
   *
   * @param {string} spaceId - Space ID
   * @param {string} bodyFormat - 본문 형식 (기본값: 'storage' = Confluence 저장 형식)
   * @returns {Promise<Page[]>} 페이지 배열
   *
   * @description
   * 페이지네이션을 처리하여 Space의 모든 페이지를 가져옴
   * 각 페이지에는 본문(body) 내용이 포함됨
   */
  async getPagesFromSpace(spaceId: string, bodyFormat = 'storage'): Promise<Page[]> {
    logger.info(`Fetching pages from space ${spaceId}...`);
    const pages: Page[] = [];
    let cursor: string | null = null;

    do {
      const params: Record<string, string | number> = {
        'space-id': spaceId,         // 조회할 Space
        'body-format': bodyFormat,   // 본문 형식
        limit: 250,                  // 페이지당 최대 개수
      };
      if (cursor) params.cursor = cursor;

      const response = await this.client.get<ConfluencePagesResponse>('/pages', {
        params,
      });

      // 각 페이지 데이터를 Page 인터페이스에 맞게 변환
      for (const item of response.data.results) {
        pages.push({
          id: String(item.id),
          title: item.title,
          spaceId: String(item.spaceId),
          parentId: item.parentId ? String(item.parentId) : null, // null이면 루트 페이지
          parentType: item.parentType === 'page' ? 'page' : 'space', // 부모가 페이지인지 Space인지
          status: item.status,
          createdAt: item.createdAt,
          body: item.body, // Confluence storage format HTML
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
   * 페이지의 첨부파일 목록 조회
   *
   * @param {string} pageId - 페이지 ID
   * @returns {Promise<Attachment[]>} 첨부파일 배열
   *
   * @description
   * REST API v1 사용 (v2에서는 첨부파일 엔드포인트 미지원)
   * 실패해도 빈 배열 반환 (에러를 throw하지 않음)
   */
  async getAttachments(pageId: string): Promise<Attachment[]> {
    logger.info(`Fetching attachments for page ${pageId}...`);
    const attachments: Attachment[] = [];

    try {
      // REST API v1 엔드포인트 사용 (baseURL 오버라이드)
      const response = await this.client.get(`/content/${pageId}/child/attachment`, {
        baseURL: `https://${config.domain}/wiki/rest/api`, // v1 API
        params: { limit: 100 },
      });

      // 첨부파일 정보 추출
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
      // 첨부파일 조회 실패는 경고만 출력하고 빈 배열 반환
      logger.warn(`Failed to fetch attachments for page ${pageId}: ${error}`);
    }

    return attachments;
  }

  /**
   * 페이지의 모든 첨부파일을 로컬 디렉토리에 다운로드
   *
   * @param {string} pageId - 페이지 ID
   * @param {string} outputDir - 저장할 디렉토리 경로
   * @returns {Promise<{downloaded: number, failed: number}>} 다운로드 결과
   *
   * @description
   * 1. 첨부파일 목록 조회
   * 2. 각 파일을 스트림으로 다운로드
   * 3. 로컬 파일로 저장
   */
  async downloadAttachments(
    pageId: string,
    outputDir: string
  ): Promise<{ downloaded: number; failed: number }> {
    // 첨부파일 목록 조회
    const attachments = await this.getAttachments(pageId);

    if (attachments.length === 0) {
      return { downloaded: 0, failed: 0 };
    }

    // 출력 디렉토리 생성
    ensureDir(outputDir);

    let downloaded = 0;
    let failed = 0;

    // 각 첨부파일 다운로드
    for (const attachment of attachments) {
      if (!attachment.downloadLink) {
        logger.warn(`No download link for attachment: ${attachment.title}`);
        failed++;
        continue;
      }

      // 저장 경로: outputDir/파일명
      const filePath = path.join(outputDir, attachment.title);

      try {
        // 다운로드 URL 구성
        const downloadUrl = `https://${config.domain}/wiki${attachment.downloadLink}`;

        // 스트림으로 다운로드 (대용량 파일 처리에 효율적)
        const response = await this.client.get(downloadUrl, {
          baseURL: '',              // baseURL 무시하고 전체 URL 사용
          responseType: 'stream',   // 스트림 응답
        });

        // pipeline: 읽기 스트림 → 쓰기 스트림 연결
        // 자동으로 에러 처리 및 스트림 정리
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

  /**
   * 페이지 삭제
   *
   * @param {string} pageId - 삭제할 페이지 ID
   *
   * @description
   * Confluence에서 페이지를 영구 삭제
   * 주의: 복구 불가능!
   */
  async deletePage(pageId: string): Promise<void> {
    logger.info(`Deleting page ${pageId}...`);
    await this.client.delete(`/pages/${pageId}`);
    logger.info(`Page ${pageId} deleted successfully.`);
  }

  /**
   * 페이지의 모든 하위 페이지 ID 조회 (재귀)
   *
   * @param {string} pageId - 부모 페이지 ID
   * @returns {Promise<string[]>} 모든 하위 페이지 ID 배열
   *
   * @description
   * 재귀적으로 모든 자손 페이지를 탐색
   * 자식 → 손자 → 증손자 ... 순서로 수집
   *
   * 사용 예: 페이지 삭제 시 하위 페이지도 함께 삭제
   */
  async getDescendantPageIds(pageId: string): Promise<string[]> {
    logger.info(`Fetching descendants for page ${pageId}...`);
    const descendants: string[] = [];
    let cursor: string | null = null;

    do {
      const params: Record<string, string | number> = { limit: 250 };
      if (cursor) params.cursor = cursor;

      // 직접 자식 페이지 조회
      const response = await this.client.get(`/pages/${pageId}/children`, { params });

      for (const item of response.data.results) {
        const childId = String(item.id);
        descendants.push(childId);

        // 재귀 호출: 자식의 자식들도 수집
        const childDescendants = await this.getDescendantPageIds(childId);
        descendants.push(...childDescendants);
      }

      cursor = response.data._links?.next
        ? new URL(response.data._links.next, `https://${config.domain}`).searchParams.get('cursor')
        : null;
    } while (cursor);

    return descendants;
  }
}

// ===== 싱글톤 패턴 구현 =====

/** 싱글톤 인스턴스 저장 변수 */
let clientInstance: ConfluenceClient | null = null;

/**
 * ConfluenceClient 싱글톤 인스턴스 반환
 *
 * @returns {ConfluenceClient} 클라이언트 인스턴스
 *
 * @description
 * 싱글톤 패턴: 애플리케이션 전체에서 하나의 인스턴스만 사용
 * 장점: 연결 재사용, 메모리 효율
 *
 * @example
 * const client = getConfluenceClient();
 */
export function getConfluenceClient(): ConfluenceClient {
  if (!clientInstance) {
    clientInstance = new ConfluenceClient();
  }
  return clientInstance;
}
