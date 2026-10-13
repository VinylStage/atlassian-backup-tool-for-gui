/**
 * @file 로깅 유틸리티
 * @description Winston 기반 단일 루트 로거 + 모듈별 child 로거
 *
 * 규칙:
 * - 레벨: npm 레벨 (error, warn, info, http, verbose, debug, silly), LOG_LEVEL로 설정
 * - 콘솔(stdout/stderr): 사람이 읽는 형식 (12-Factor App: 로그는 이벤트 스트림)
 * - 파일: JSON Lines + ISO 8601(UTC) 타임스탬프
 *   - app.log   : LOG_LEVEL 이상 전체
 *   - error.log : error 레벨만 (uncaught exception / unhandled rejection 포함)
 * - 저장 위치: OS 표준 경로 (config.ts resolveLogsDir 참조), LOG_DIR로 변경 가능
 * - 로테이션: 크기 기준 (LOG_MAX_SIZE_MB), 최대 LOG_MAX_FILES개 보관
 *   - app.log 가 항상 최신, app1.log, app2.log ... 순으로 오래된 로그
 * - 요청 처리 중 기록된 로그에는 requestId 자동 포함
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';
import { getRequestId } from './requestContext.js';

/** 요청 컨텍스트의 requestId를 로그 엔트리에 추가 */
const addRequestId = winston.format((info) => {
  const requestId = getRequestId();
  if (requestId && info.requestId === undefined) {
    info.requestId = requestId;
  }
  return info;
});

/** 콘솔 출력용 레벨 대문자화 (colorize 이전에 적용해야 ANSI 코드가 깨지지 않음) */
const upperLevel = winston.format((info) => {
  info.level = info.level.toUpperCase();
  return info;
});

/**
 * 콘솔 출력 포맷
 *
 * @example
 * // 2026-10-13T06:40:00.123Z [ERROR] [routes_backup] [3f2a...] Download backup failed {"code":"..."}
 */
const consoleFormat = winston.format.printf(({ level, message, timestamp, module, requestId, stack, ...meta }) => {
  const tags = [module, requestId].filter(Boolean).map((tag) => `[${tag}]`).join(' ');
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const stackStr = stack ? `\n${stack}` : '';
  return `${timestamp} [${level}]${tags ? ` ${tags}` : ''} ${message}${metaStr}${stackStr}`;
});

/** 로그 디렉토리 준비 (실패 시 false → 콘솔 전용으로 동작) */
function ensureLogsDir(): boolean {
  try {
    fs.mkdirSync(config.logsDir, { recursive: true });
    return true;
  } catch (err) {
    console.error(`Failed to create log directory ${config.logsDir}; file logging disabled:`, err);
    return false;
  }
}

function createRootLogger(): winston.Logger {
  const transports: winston.transport[] = [
    new winston.transports.Console({
      stderrLevels: ['error'],
      handleExceptions: true,
      handleRejections: true,
      format: winston.format.combine(upperLevel(), winston.format.colorize(), consoleFormat),
    }),
  ];

  if (ensureLogsDir()) {
    const rotation = {
      maxsize: config.logMaxSizeMb * 1024 * 1024,
      maxFiles: config.logMaxFiles,
      tailable: true,
    };

    transports.push(
      new winston.transports.File({
        filename: path.join(config.logsDir, 'app.log'),
        format: winston.format.json(),
        ...rotation,
      }),
      new winston.transports.File({
        filename: path.join(config.logsDir, 'error.log'),
        level: 'error',
        handleExceptions: true,
        handleRejections: true,
        format: winston.format.json(),
        ...rotation,
      })
    );
  }

  return winston.createLogger({
    level: config.logLevel,
    format: winston.format.combine(
      winston.format.timestamp(), // ISO 8601 (UTC)
      winston.format.errors({ stack: true }),
      addRequestId()
    ),
    transports,
    exitOnError: true,
  });
}

let rootLogger: winston.Logger | null = null;

/** 프로세스 전역 루트 로거 (최초 호출 시 1회 생성) */
function getRootLogger(): winston.Logger {
  if (!rootLogger) {
    rootLogger = createRootLogger();
  }
  return rootLogger;
}

/**
 * 모듈별 로거 생성
 *
 * @param {string} prefix - 모듈 이름 (로그 엔트리의 module 필드)
 * @returns {winston.Logger} 루트 로거의 child 로거 (동일 파일/콘솔 공유)
 *
 * @example
 * const logger = setupLogger('server');
 * logger.info('서버 시작');
 * logger.error('에러 발생', error);
 */
export function setupLogger(prefix: string): winston.Logger {
  return getRootLogger().child({ module: prefix });
}
