/**
 * @file 애플리케이션 에러 정의
 * @description 클라이언트가 언어별 메시지로 변환할 수 있도록 에러 코드를 부여
 *
 * 응답 형식:
 * { code, message, details?, requestId? }
 * - code: 클라이언트 다국어 메시지 키 (src/client/i18n/errorMessages.ts)
 * - message: 영어 기본 메시지 (코드 미지원 클라이언트용 폴백)
 */

import type { Response } from 'express';
import { getRequestId } from './requestContext.js';

export const ErrorCode = {
  PDF_BROWSER_NOT_FOUND: 'PDF_BROWSER_NOT_FOUND',
  PDF_BROWSER_LAUNCH_FAILED: 'PDF_BROWSER_LAUNCH_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, string>;

  constructor(
    code: ErrorCode,
    message: string,
    status = 500,
    details?: Record<string, string>,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * 에러 응답 전송
 *
 * @param fallbackMessage - Error 객체가 아닐 때 사용할 메시지
 *
 * @description
 * AppError는 지정된 status/code로, 그 외 에러는 500 + INTERNAL_ERROR로 응답
 * 스트리밍이 이미 시작된 경우(headersSent)에는 응답하지 않음
 */
export function sendError(res: Response, error: unknown, fallbackMessage: string): void {
  if (res.headersSent) return;

  const requestId = getRequestId();
  if (error instanceof AppError) {
    res.status(error.status).json({
      code: error.code,
      message: error.message,
      details: error.details,
      requestId,
    });
    return;
  }

  res.status(500).json({
    code: ErrorCode.INTERNAL_ERROR,
    message: error instanceof Error ? error.message : fallbackMessage,
    requestId,
  });
}
