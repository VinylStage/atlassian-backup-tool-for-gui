/**
 * @file PDF 변환용 브라우저 관리
 * @description Puppeteer 브라우저 실행 경로 결정 및 실행
 *
 * 실행 파일 결정 순서:
 * 1. PUPPETEER_EXECUTABLE_PATH 환경 변수 (지정 시 해당 경로만 사용)
 * 2. Puppeteer 번들 Chrome (~/.cache/puppeteer, `npx puppeteer browsers install chrome`로 설치)
 * 3. 시스템에 설치된 Chrome/Chromium (OS별 기본 경로)
 *
 * 실패 시 AppError(PDF_BROWSER_NOT_FOUND / PDF_BROWSER_LAUNCH_FAILED)를 던져
 * 클라이언트가 사용자 언어로 안내 메시지를 표시할 수 있게 함
 */

import fs from 'fs';
import path from 'path';
import { setupLogger } from '../utils/logger.js';
import { AppError, ErrorCode } from '../utils/errors.js';

const logger = setupLogger('browser');

type Puppeteer = typeof import('puppeteer').default;
export type PdfBrowser = Awaited<ReturnType<Puppeteer['launch']>>;

/** 번들 Chrome 설치 명령 (클라이언트 안내 메시지에 포함) */
export const BROWSER_INSTALL_COMMAND = 'npx puppeteer browsers install chrome';

/** OS별 시스템 Chrome/Chromium 기본 설치 경로 */
function systemBrowserPaths(): string[] {
  switch (process.platform) {
    case 'darwin':
      return [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ];
    case 'win32':
      return [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
        .filter((dir): dir is string => Boolean(dir))
        .map((dir) => path.join(dir, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    default:
      return [
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
      ];
  }
}

function notFoundError(): AppError {
  return new AppError(
    ErrorCode.PDF_BROWSER_NOT_FOUND,
    `Chrome for PDF export is not installed. Run "${BROWSER_INSTALL_COMMAND}" on the server ` +
      'or set PUPPETEER_EXECUTABLE_PATH to an installed Chrome/Chromium.',
    503,
    { installCommand: BROWSER_INSTALL_COMMAND }
  );
}

/**
 * 사용할 브라우저 실행 파일 경로 결정
 *
 * @throws {AppError} PDF_BROWSER_NOT_FOUND - 사용 가능한 브라우저 없음
 */
async function resolveExecutablePath(puppeteer: Puppeteer): Promise<string> {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath) {
    if (fs.existsSync(envPath)) return envPath;
    logger.error(`PUPPETEER_EXECUTABLE_PATH does not exist: ${envPath}`);
    throw notFoundError();
  }

  const bundledPath = await puppeteer.executablePath();
  if (fs.existsSync(bundledPath)) return bundledPath;

  const systemPath = systemBrowserPaths().find((candidate) => fs.existsSync(candidate));
  if (systemPath) {
    logger.warn(
      `Bundled Chrome not found at ${bundledPath}; falling back to system browser ${systemPath}. ` +
        `Run "${BROWSER_INSTALL_COMMAND}" to install the version pinned by puppeteer.`
    );
    return systemPath;
  }

  logger.error(
    `No browser available for PDF export. Expected bundled Chrome at ${bundledPath}. ` +
      `Run "${BROWSER_INSTALL_COMMAND}" or set PUPPETEER_EXECUTABLE_PATH.`
  );
  throw notFoundError();
}

/**
 * PDF 변환용 headless 브라우저 실행
 *
 * @throws {AppError} PDF_BROWSER_NOT_FOUND | PDF_BROWSER_LAUNCH_FAILED
 */
export async function launchPdfBrowser(): Promise<PdfBrowser> {
  const puppeteer = (await import('puppeteer')).default;
  const executablePath = await resolveExecutablePath(puppeteer);

  try {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath,
      // Enable file:// access for local images in PDF
      args: ['--allow-file-access-from-files', '--disable-web-security'],
    });
    logger.info(`PDF browser launched: ${executablePath}`);
    return browser;
  } catch (error) {
    logger.error(`Failed to launch PDF browser (${executablePath}):`, error);
    throw new AppError(
      ErrorCode.PDF_BROWSER_LAUNCH_FAILED,
      `Failed to launch Chrome for PDF export: ${error instanceof Error ? error.message : String(error)}`,
      503,
      { installCommand: BROWSER_INSTALL_COMMAND },
      { cause: error }
    );
  }
}

/**
 * 서버 시작 시 PDF 브라우저 사용 가능 여부 점검 (예외를 던지지 않음)
 */
export async function checkPdfBrowser(): Promise<void> {
  try {
    const puppeteer = (await import('puppeteer')).default;
    const executablePath = await resolveExecutablePath(puppeteer);
    logger.info(`PDF export browser: ${executablePath}`);
  } catch {
    logger.warn('PDF export is unavailable until a browser is installed (HTML/Markdown are unaffected).');
  }
}
