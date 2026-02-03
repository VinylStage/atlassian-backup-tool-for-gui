/**
 * @file 로깅 유틸리티
 * @description Winston 기반 로거 설정 및 생성
 *
 * 기능:
 * - 콘솔 출력 (컬러 포함)
 * - 파일 출력 (logs/ 디렉토리)
 * - 타임스탬프 포맷팅
 * - 모듈별 로그 파일 분리
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';

/**
 * 커스텀 로그 포맷 정의
 *
 * @description
 * Winston의 printf 포맷을 사용하여 로그 출력 형식 지정
 * 형식: "YYYY-MM-DD HH:mm:ss [LEVEL] 메시지 {메타데이터}"
 *
 * @example
 * // 출력 예시
 * // 2024-01-15 14:30:00 [INFO] Server started {"port": 3000}
 */
const logFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  // 추가 메타데이터가 있으면 JSON으로 직렬화
  const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';

  // 최종 로그 문자열 조합 후 앞뒤 공백 제거
  return `${timestamp} [${level.toUpperCase()}] ${message} ${metaStr}`.trim();
});

/**
 * 로거 인스턴스 생성 함수
 *
 * @param {string} prefix - 로그 파일 이름에 사용할 접두사
 * @returns {winston.Logger} 설정된 Winston 로거 인스턴스
 *
 * @description
 * 각 모듈(서버, API 등)마다 별도의 로거를 생성하여 사용
 * 로그 파일은 logs/{prefix}_{timestamp}.log 형식으로 저장
 *
 * @example
 * const logger = setupLogger('server');
 * logger.info('서버 시작');  // 콘솔 + 파일에 기록
 * logger.error('에러 발생', { code: 500 });
 */
export function setupLogger(prefix: string): winston.Logger {
  // 로그 디렉토리가 없으면 생성
  // recursive: true - 중간 경로도 함께 생성
  if (!fs.existsSync(config.logsDir)) {
    fs.mkdirSync(config.logsDir, { recursive: true });
  }

  // 타임스탬프 생성 (파일명에 사용)
  // ISO 형식에서 특수문자(:, .)를 하이픈으로 치환
  // 예: 2024-01-15T14:30:00.000Z → 2024-01-15T14-30-00
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  // 로그 파일 경로 생성
  // 예: logs/server_2024-01-15T14-30-00.log
  const logFile = path.join(config.logsDir, `${prefix}_${timestamp}.log`);

  // Winston 로거 생성 및 반환
  return winston.createLogger({
    level: 'info', // 최소 로그 레벨 (info 이상만 기록)

    // 기본 포맷 설정 (파일 출력용)
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), // 타임스탬프 추가
      logFormat // 커스텀 포맷 적용
    ),

    // 출력 대상 (Transport) 설정
    transports: [
      // 콘솔 출력 (개발 시 확인용)
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(), // 레벨별 색상 적용 (info=green, error=red 등)
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          logFormat
        ),
      }),

      // 파일 출력 (영구 보관용)
      new winston.transports.File({ filename: logFile }),
    ],
  });
}
