import fs from 'fs';
import path from 'path';

export function safeFilename(s: string): string {
  let result = (s || '').trim();
  result = result.replace(/[\\/:*?"<>|\s]+/g, '_');
  result = result.replace(/_+/g, '_');
  result = result.replace(/^_|_$/g, '');
  return result.slice(0, 120) || 'untitled';
}

export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function writeFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  fs.writeFileSync(filePath, content, 'utf-8');
}

export function writeJson(filePath: string, data: unknown): void {
  writeFile(filePath, JSON.stringify(data, null, 2));
}
