/**
 * @file 에러 메시지 다국어 처리
 * @description 서버 에러 코드(code)를 브라우저 언어에 맞는 메시지로 변환
 *
 * - 지원 언어: ko, en (navigator.languages 순서대로 매칭, 기본 en)
 * - 코드가 없거나 미등록 코드면 서버 message를 그대로 사용
 * - 서버 코드 정의: src/server/utils/errors.ts
 */

import { ApiError } from '../services/api';

type Locale = 'ko' | 'en';
type Details = Record<string, string>;

const DEFAULT_INSTALL_COMMAND = 'npx puppeteer browsers install chrome';

const MESSAGES: Record<string, Record<Locale, (details: Details) => string>> = {
  PDF_BROWSER_NOT_FOUND: {
    ko: (d) =>
      'PDF 변환에 필요한 Chrome 브라우저가 서버에 설치되어 있지 않습니다. ' +
      `서버에서 "${d.installCommand || DEFAULT_INSTALL_COMMAND}" 명령을 실행한 뒤 다시 시도하세요. ` +
      '(HTML/Markdown 다운로드는 PDF 선택을 해제하면 바로 사용할 수 있습니다.)',
    en: (d) =>
      'Chrome, which is required for PDF export, is not installed on the server. ' +
      `Run "${d.installCommand || DEFAULT_INSTALL_COMMAND}" on the server and try again. ` +
      '(HTML/Markdown downloads work if you deselect PDF.)',
  },
  PDF_BROWSER_LAUNCH_FAILED: {
    ko: (d) =>
      'PDF 변환용 Chrome 브라우저를 실행하지 못했습니다. 서버 로그를 확인하거나 ' +
      `"${d.installCommand || DEFAULT_INSTALL_COMMAND}" 명령으로 브라우저를 다시 설치하세요.`,
    en: (d) =>
      'Failed to launch Chrome for PDF export. Check the server log or reinstall the browser with ' +
      `"${d.installCommand || DEFAULT_INSTALL_COMMAND}".`,
  },
};

const REQUEST_ID_LABEL: Record<Locale, string> = {
  ko: '요청 ID',
  en: 'Request ID',
};

/** 브라우저 선호 언어 중 지원 언어 선택 */
export function detectLocale(): Locale {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const lang of languages) {
    const base = lang?.toLowerCase().split('-')[0];
    if (base === 'ko' || base === 'en') return base;
  }
  return 'en';
}

/**
 * 에러를 사용자 언어 메시지로 변환
 *
 * @param err - catch로 받은 에러
 * @param fallback - 메시지를 얻을 수 없을 때 사용할 문구
 */
export function localizeError(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.code && MESSAGES[err.code]) {
    const locale = detectLocale();
    const message = MESSAGES[err.code][locale](err.details ?? {});
    return err.requestId ? `${message} (${REQUEST_ID_LABEL[locale]}: ${err.requestId})` : message;
  }
  return err instanceof Error && err.message ? err.message : fallback;
}
