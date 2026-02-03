/**
 * @file 서버 설정 모듈
 * @description 환경 변수를 로드하고 애플리케이션 설정을 관리
 *
 * 환경 변수 우선순위:
 * 1. 시스템 환경 변수
 * 2. .env 파일 (dotenv가 로드)
 * 3. 기본값
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// .env 파일을 읽어서 process.env에 로드
// 프로젝트 루트의 .env 파일을 자동으로 찾음
dotenv.config();

// ES 모듈에서 __dirname 구현
// ES 모듈은 CommonJS와 달리 __dirname이 기본 제공되지 않음
const __filename = fileURLToPath(import.meta.url); // 현재 파일의 절대 경로
const __dirname = path.dirname(__filename);         // 현재 파일이 있는 디렉토리

/**
 * 애플리케이션 전역 설정 객체
 *
 * @property {string} domain - Confluence 도메인 (예: company.atlassian.net)
 * @property {string} email - Atlassian 계정 이메일
 * @property {string} apiToken - Atlassian API 토큰
 * @property {number} port - 서버 포트 번호
 * @property {string} nodeEnv - 실행 환경 (development/production)
 * @property {boolean} isDev - 개발 모드 여부
 * @property {string} dataDir - 백업 데이터 저장 경로
 * @property {string} logsDir - 로그 파일 저장 경로
 * @property {string} clientDir - 빌드된 클라이언트 파일 경로
 */
export const config = {
  // Confluence API 연결 정보
  domain: process.env.DOMAIN || '',      // DOMAIN 환경 변수
  email: process.env.EMAIL || '',        // EMAIL 환경 변수
  apiToken: process.env.API_TOKEN || '', // API_TOKEN 환경 변수

  // 서버 설정
  port: parseInt(process.env.PORT || '3000', 10), // 문자열을 10진수 정수로 변환
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',   // production이 아니면 개발 모드

  // 경로 설정 (현재 파일 기준 상대 경로를 절대 경로로 변환)
  dataDir: path.resolve(__dirname, '../../data'),       // src/server/../../data = ./data
  logsDir: path.resolve(__dirname, '../../logs'),       // ./logs
  clientDir: path.resolve(__dirname, '../../dist/client'), // ./dist/client
};

/**
 * 필수 환경 변수 검증 함수
 *
 * @description
 * 서버 시작 시 호출되어 필수 설정이 있는지 확인
 * 누락된 설정이 있으면 경고 메시지 출력 (에러는 발생시키지 않음)
 *
 * @example
 * validateConfig(); // 서버 시작 전 호출
 */
export function validateConfig(): void {
  // 검증할 필수 키 목록
  // as const: 배열을 읽기 전용 튜플 타입으로 변환
  const required = ['domain', 'email', 'apiToken'] as const;

  // 값이 비어있는 키 필터링
  // config[key]가 falsy(빈 문자열 포함)이면 missing에 포함
  const missing = required.filter((key) => !config[key]);

  // 누락된 설정이 있으면 경고
  if (missing.length > 0) {
    console.warn(
      `Warning: Missing environment variables: ${missing.join(', ')}`
    );
    console.warn('Please copy .env.template to .env and fill in your credentials.');
  }
}
