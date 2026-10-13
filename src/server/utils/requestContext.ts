/**
 * @file 요청 컨텍스트
 * @description AsyncLocalStorage로 요청 단위 식별자(Request ID)를 전파
 *
 * - 모든 로그에 requestId를 자동으로 포함 (logger.ts에서 참조)
 * - 응답 헤더 X-Request-Id 및 에러 응답 본문에 동일 ID 노출
 */

import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** 클라이언트가 전달한 X-Request-Id 허용 형식 (로그 인젝션 방지) */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/** 현재 실행 컨텍스트의 Request ID (요청 밖이면 undefined) */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/**
 * Request ID 미들웨어
 *
 * @description
 * X-Request-Id 헤더가 유효하면 재사용하고, 없으면 UUID를 생성하여
 * 이후 비동기 체인 전체에서 getRequestId()로 조회할 수 있게 함
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.get('x-request-id');
  const requestId = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', requestId);
  storage.run({ requestId }, next);
}
