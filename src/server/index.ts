/**
 * @file 서버 진입점 (Entry Point)
 * @description Express 서버를 설정하고 시작하는 메인 파일
 *
 * 이 파일의 역할:
 * 1. Express 앱 인스턴스 생성
 * 2. 미들웨어 설정 (JSON 파싱, API 라우터)
 * 3. 개발/프로덕션 모드에 따른 정적 파일 서빙 설정
 * 4. 글로벌 에러 핸들러 등록
 * 5. 서버 시작
 */

import express from 'express';
import path from 'path';
import { config, validateConfig } from './config.js';
import { createApiRouter } from './routes/api.js';
import { setupLogger } from './utils/logger.js';

// 'server' 프리픽스로 로거 인스턴스 생성
// 로그 파일명: logs/server_YYYY-MM-DD_HH-mm-ss.log
const logger = setupLogger('server');

/**
 * 서버를 시작하는 비동기 함수
 *
 * @async
 * @description
 * 1. 환경 변수 검증
 * 2. Express 앱 설정
 * 3. 개발/프로덕션 모드 분기 처리
 * 4. 서버 리스닝 시작
 */
async function startServer() {
  // 필수 환경 변수(domain, email, apiToken) 존재 여부 확인
  validateConfig();

  // Express 애플리케이션 인스턴스 생성
  const app = express();

  // JSON 요청 본문 파싱 미들웨어
  // Content-Type: application/json 요청을 자동으로 파싱하여 req.body에 저장
  app.use(express.json());

  // API 라우터 마운트
  // /api/* 경로의 모든 요청을 API 라우터로 전달
  app.use('/api', createApiRouter());

  // 개발 모드 vs 프로덕션 모드 분기
  if (config.isDev) {
    // ===== 개발 모드 =====
    // Vite 개발 서버를 미들웨어 모드로 실행
    // 장점: HMR(Hot Module Replacement), 빠른 새로고침

    // Vite를 동적 import (개발 모드에서만 필요)
    const { createServer: createViteServer } = await import('vite');

    // Vite 개발 서버 생성
    const vite = await createViteServer({
      server: { middlewareMode: true }, // Express 미들웨어로 동작
      appType: 'spa',                   // Single Page Application 모드
      root: path.resolve(process.cwd(), 'src/client'), // React 소스 경로
    });

    // Vite 미들웨어를 Express에 연결
    // React 개발 서버 기능을 Express 앱에 통합
    app.use(vite.middlewares);
  } else {
    // ===== 프로덕션 모드 =====
    // 빌드된 정적 파일 서빙

    // dist/client 폴더의 정적 파일 서빙 (JS, CSS, 이미지 등)
    app.use(express.static(config.clientDir));

    // SPA 폴백: API가 아닌 모든 경로에서 index.html 반환
    // React Router가 클라이언트에서 라우팅을 처리할 수 있도록 함
    app.get('*', (_req, res) => {
      res.sendFile(path.join(config.clientDir, 'index.html'));
    });
  }

  // 글로벌 에러 핸들러
  // 미들웨어/라우트에서 throw된 에러를 여기서 처리
  // 4개의 파라미터가 있어야 Express가 에러 핸들러로 인식
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      // 에러 로깅 (파일 + 콘솔)
      logger.error('Unhandled error:', err);

      // 클라이언트에게 500 에러 응답
      res.status(500).json({ message: 'Internal server error' });
    }
  );

  // 서버 시작
  // config.port (기본값: 3000)에서 리스닝
  app.listen(config.port, () => {
    logger.info(`Server running at http://localhost:${config.port}`);

    // 개발 모드일 때 추가 메시지
    if (config.isDev) {
      logger.info('Development mode with Vite HMR enabled');
    }
  });
}

// 서버 시작 함수 실행
// 에러 발생 시 콘솔에 출력하고 프로세스 종료
startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1); // 비정상 종료 코드
});
