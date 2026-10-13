/**
 * @file 액세스 로그 미들웨어
 * @description API 요청의 method/url/status/소요시간 기록
 *
 * 레벨:
 * - 4xx/5xx: warn (기본 LOG_LEVEL=info에서 기록)
 * - 그 외: http (LOG_LEVEL=http 이상에서 기록)
 */

import type { Request, Response, NextFunction } from 'express';
import { setupLogger } from '../utils/logger.js';
import { getRequestId } from '../utils/requestContext.js';

const logger = setupLogger('http');

export function accessLog(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  const requestId = getRequestId();

  res.on('finish', () => {
    const durationMs = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
    const level = res.statusCode >= 400 ? 'warn' : 'http';
    logger.log(level, `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`, {
      requestId,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs,
    });
  });

  next();
}
