/**
 * @file 파일 시스템 유틸리티
 * @description 파일/디렉토리 조작을 위한 헬퍼 함수 모음
 *
 * 주요 기능:
 * - 안전한 파일명 생성
 * - 디렉토리 생성
 * - 파일/JSON 쓰기
 */

import fs from 'fs';
import path from 'path';

/**
 * 안전한 파일명으로 변환
 *
 * @param {string} s - 원본 문자열 (페이지 제목 등)
 * @returns {string} 파일 시스템에서 사용 가능한 안전한 문자열
 *
 * @description
 * 파일명에 사용할 수 없는 문자를 언더바(_)로 치환
 * 연속된 언더바 정리 및 길이 제한 적용
 *
 * @example
 * safeFilename('My Page: Overview')  // 'My_Page_Overview'
 * safeFilename('  Test  ')           // 'Test'
 * safeFilename('A/B*C?D')            // 'A_B_C_D'
 * safeFilename('')                   // 'untitled'
 */
export function safeFilename(s: string): string {
  // Step 1: null/undefined 방어 및 앞뒤 공백 제거
  let result = (s || '').trim();

  // Step 2: 파일명에 사용 불가한 문자들을 언더바로 치환
  // Windows 금지 문자: \ / : * ? " < > |
  // 추가로 공백도 언더바로 변환
  result = result.replace(/[\\/:*?"<>|\s]+/g, '_');

  // Step 3: 연속된 언더바를 하나로 축소
  // 예: "A___B" → "A_B"
  result = result.replace(/_+/g, '_');

  // Step 4: 앞뒤 언더바 제거
  // 예: "_Title_" → "Title"
  result = result.replace(/^_|_$/g, '');

  // Step 5: 최대 길이 120자로 제한, 비어있으면 'untitled' 반환
  return result.slice(0, 120) || 'untitled';
}

/**
 * 디렉토리 존재 확인 및 생성
 *
 * @param {string} dirPath - 생성할 디렉토리 경로
 *
 * @description
 * 디렉토리가 없으면 재귀적으로 생성
 * 이미 존재하면 아무 작업 안 함
 *
 * @example
 * ensureDir('./data/backup/2024');
 * // data, data/backup, data/backup/2024 순서로 생성
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    // recursive: true - 중간 경로가 없어도 전체 경로 생성
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 텍스트 파일 쓰기
 *
 * @param {string} filePath - 저장할 파일 경로
 * @param {string} content - 저장할 내용
 *
 * @description
 * 파일이 위치할 디렉토리가 없으면 자동 생성
 * UTF-8 인코딩으로 저장
 *
 * @example
 * writeFile('./data/page.html', '<html>...</html>');
 */
export function writeFile(filePath: string, content: string): void {
  // 파일이 저장될 디렉토리 경로 추출
  const dir = path.dirname(filePath);

  // 디렉토리 없으면 생성
  ensureDir(dir);

  // 파일 쓰기 (동기 방식)
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * JSON 파일 쓰기
 *
 * @param {string} filePath - 저장할 파일 경로
 * @param {unknown} data - 저장할 데이터 (객체/배열 등)
 *
 * @description
 * JavaScript 객체를 JSON 문자열로 변환하여 저장
 * 2칸 들여쓰기로 포맷팅하여 가독성 확보
 *
 * @example
 * writeJson('./data/meta.json', { id: '123', title: 'Test' });
 * // 결과 파일:
 * // {
 * //   "id": "123",
 * //   "title": "Test"
 * // }
 */
export function writeJson(filePath: string, data: unknown): void {
  // JSON.stringify(data, null, 2):
  // - null: replacer 없음 (모든 속성 포함)
  // - 2: 들여쓰기 공백 수
  writeFile(filePath, JSON.stringify(data, null, 2));
}
