import path from 'path';
import TurndownService from 'turndown';
import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import { config } from '../config.js';
import { setupLogger } from '../utils/logger.js';
import { safeFilename, ensureDir, writeFile, writeJson } from '../utils/fileUtils.js';
import type { Page } from '../types/confluence.js';

const logger = setupLogger('parser');

// Configure marked with syntax highlighting
marked.use(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code: string, lang: string) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    },
  })
);

// Turndown for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

// Confluence code macro regex
const CODE_MACRO_REGEX =
  /<ac:structured-macro[^>]*ac:name="code"[^>]*>[\s\S]*?(?:<ac:parameter[^>]*ac:name="language"[^>]*>\s*([^<]+?)\s*<\/ac:parameter>)?[\s\S]*?<ac:plain-text-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>[\s\S]*?<\/ac:structured-macro>/g;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildPageLookup(pages: Page[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const page of pages) {
    lookup.set(page.id, page.title);
  }
  return lookup;
}

export function confluenceCodeMacroToFence(htmlContent: string): string {
  const codeBlocks: string[] = [];

  // Step 1: Extract code macros and replace with placeholders
  // This prevents TurndownService from escaping backticks
  const withPlaceholders = htmlContent.replace(
    CODE_MACRO_REGEX,
    (_match: string, lang: string | undefined, body: string | undefined) => {
      const language = (lang || '').trim();
      const code = (body || '').replace(/\r\n/g, '\n').trimEnd();
      const fence = '```';
      const block = language
        ? `\n${fence}${language}\n${code}\n${fence}\n`
        : `\n${fence}\n${code}\n${fence}\n`;
      codeBlocks.push(block);
      return `___CODE_BLOCK_PLACEHOLDER_${codeBlocks.length - 1}___`;
    }
  );

  // Step 2: Convert remaining HTML to Markdown
  let markdown = turndownService.turndown(withPlaceholders);

  // Step 3: Restore code blocks from placeholders
  codeBlocks.forEach((block, i) => {
    markdown = markdown.replace(`___CODE_BLOCK_PLACEHOLDER_${i}___`, block);
  });

  return markdown;
}

function buildOutputDir(
  page: Page,
  outputRoot: string,
  spaceName: string,
  pageLookup: Map<string, string>
): string {
  const spaceId = page.spaceId;
  const parentId = page.parentId;

  const spaceSafe = safeFilename(spaceName);
  const spaceDirName = spaceSafe ? `space-${spaceId}_${spaceSafe}` : `space-${spaceId}`;

  let folderDir: string;
  if (parentId) {
    const parentTitle = safeFilename(pageLookup.get(parentId) || '');
    const folderName = parentTitle
      ? `folder-${parentId}_${parentTitle}`
      : `folder-${parentId}`;
    folderDir = path.join(outputRoot, spaceDirName, folderName);
  } else {
    folderDir = path.join(outputRoot, spaceDirName, 'folder-root');
  }

  ensureDir(folderDir);
  return folderDir;
}

function buildHtmlDoc(
  page: Page,
  spaceName: string,
  pageLookup: Map<string, string>
): string {
  const titleSafe = escapeHtml(page.title || '');
  const bodyHtml = page.body?.storage?.value || '';
  const spaceNameSafe = escapeHtml(spaceName);
  const parentName = page.parentId ? escapeHtml(pageLookup.get(page.parentId) || '') : '';
  const folderDisplay = page.parentId
    ? `${page.parentId} (${parentName || 'Unknown'})`
    : '- (Root)';
  const spaceDisplay = `${page.spaceId} (${spaceNameSafe || 'Unknown'})`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="utf-8" />
    <title>${titleSafe}</title>
    <style>
        :root {
            color-scheme: light dark;
        }
        body {
            font-family: sans-serif;
            margin: 0;
            padding: 2rem 1rem;
            background: #f5f5f7;
            color: #111111;
        }
        .page-wrapper {
            max-width: 960px;
            margin: 0 auto;
        }
        .page-header {
            margin-bottom: 1.5rem;
        }
        h1 {
            font-size: 1.9rem;
            margin: 0 0 0.5rem 0;
        }
        .meta {
            font-size: 0.85rem;
            color: #666;
        }
        .meta span {
            display: inline-block;
            margin-right: 1rem;
        }
        .card {
            background: #fafafa;
            color: #111111;
            border-radius: 10px;
            padding: 1.5rem 1.75rem;
            box-shadow: 0 4px 18px rgba(0, 0, 0, 0.04);
        }
        .card :first-child {
            margin-top: 0;
        }
        .card :last-child {
            margin-bottom: 0;
        }
        hr {
            border: none;
            border-top: 1px solid #e0e0e0;
            margin: 1.5rem 0;
        }
        code {
            background: #f2f2f5;
            padding: 0.1rem 0.25rem;
            border-radius: 4px;
            font-family: "JetBrains Mono", "Fira Code", Consolas, monospace;
            font-size: 0.9em;
        }
        pre code {
            display: block;
            padding: 0.75rem 1rem;
            overflow-x: auto;
            background: #1e1e1e;
            color: #eaeaea;
        }
        a {
            color: #0070f3;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        footer {
            margin-top: 2rem;
            font-size: 0.8rem;
            color: #888;
            text-align: center;
        }
        h1, h2, h3, h4, h5, h6 {
            color: #111111
        }
    </style>
</head>
<body>
    <div class="page-wrapper">
        <header class="page-header">
            <h1>${titleSafe}</h1>
            <div class="meta">
                <span><strong>ID</strong> ${page.id}</span>
                <span><strong>Space</strong> ${spaceDisplay}</span>
                <span><strong>Folder</strong> ${folderDisplay}</span>
                <span><strong>Status</strong> ${page.status}</span>
                <span><strong>Created</strong> ${page.createdAt}</span>
            </div>
        </header>

        <main class="card">
${bodyHtml}
        </main>

        <footer>
            <hr />
            <div>Exported from Confluence space ${spaceDisplay} · Local backup view</div>
        </footer>
    </div>
</body>
</html>
`;
}

export interface HtmlResult {
  htmlCount: number;
  jsonCount: number;
}

export function convertToHtml(
  pages: Page[],
  outputRoot: string,
  spaceName: string
): HtmlResult {
  ensureDir(outputRoot);
  const pageLookup = buildPageLookup(pages);

  let htmlCount = 0;
  let jsonCount = 0;

  for (const page of pages) {
    if (!page.id) {
      logger.warn('[SKIP] No id - skipping this item');
      continue;
    }

    const safeTitle = safeFilename(page.title);
    const outDir = buildOutputDir(page, outputRoot, spaceName, pageLookup);

    // Save meta JSON
    const metaPath = path.join(outDir, `${page.id}_${safeTitle}.json`);
    writeJson(metaPath, page);
    jsonCount++;

    const bodyHtml = page.body?.storage?.value;
    if (!bodyHtml) {
      logger.warn(`[WARN] No body.storage.value - HTML skipped, meta only saved (id=${page.id})`);
      continue;
    }

    // Save HTML
    const htmlDoc = buildHtmlDoc(page, spaceName, pageLookup);
    const htmlPath = path.join(outDir, `${page.id}_${safeTitle}.html`);
    writeFile(htmlPath, htmlDoc);
    htmlCount++;
  }

  return { htmlCount, jsonCount };
}

export interface MarkdownResult {
  mdCount: number;
  skippedCount: number;
}

export function convertToMarkdown(
  pages: Page[],
  outputRoot: string,
  spaceName: string
): MarkdownResult {
  ensureDir(outputRoot);
  const pageLookup = buildPageLookup(pages);

  let mdCount = 0;
  let skippedCount = 0;

  for (const page of pages) {
    if (!page.id) {
      logger.warn('[SKIP] No id - skipping this item');
      skippedCount++;
      continue;
    }

    const bodyStorage = page.body?.storage?.value;
    if (!bodyStorage) {
      logger.warn(`[SKIP] No body (id=${page.id})`);
      skippedCount++;
      continue;
    }

    const safeTitle = safeFilename(page.title);
    const mdBody = confluenceCodeMacroToFence(bodyStorage);

    const spaceSafe = safeFilename(spaceName);
    const spaceDirName = spaceSafe
      ? `space-${page.spaceId}_${spaceSafe}`
      : `space-${page.spaceId}`;

    let fileDir: string;
    if (page.parentId) {
      const parentTitle = safeFilename(pageLookup.get(page.parentId) || '');
      const folderName = parentTitle
        ? `folder-${page.parentId}_${parentTitle}`
        : `folder-${page.parentId}`;
      fileDir = path.join(outputRoot, spaceDirName, folderName);
    } else {
      fileDir = path.join(outputRoot, spaceDirName, 'folder-root');
    }

    ensureDir(fileDir);
    const filePath = path.join(fileDir, `${page.id}_${safeTitle}.md`);

    const parentName = page.parentId ? pageLookup.get(page.parentId) || '' : '';
    const folderInfo = page.parentId
      ? `${page.parentId} (${parentName || 'Unknown'})`
      : '- (Root)';
    const spaceInfo = `${page.spaceId} (${spaceName || 'Unknown'})`;

    let content = `# ${page.title}\n\n`;
    content += `<!-- id: ${page.id} | space: ${spaceInfo} | folder: ${folderInfo} | parent_type: ${page.parentType} -->\n\n`;
    content += mdBody;

    writeFile(filePath, content);
    mdCount++;
    logger.info(`Written: ${path.basename(filePath)}`);
  }

  return { mdCount, skippedCount };
}

export interface PdfResult {
  pdfCount: number;
  skippedCount: number;
}

export async function convertToPdf(
  pages: Page[],
  outputRoot: string,
  spaceName: string
): Promise<PdfResult> {
  // Lazy import puppeteer
  const puppeteer = await import('puppeteer');

  ensureDir(outputRoot);
  const pageLookup = buildPageLookup(pages);

  let pdfCount = 0;
  let skippedCount = 0;

  const browser = await puppeteer.default.launch({ headless: true });

  try {
    for (const page of pages) {
      if (!page.id) {
        logger.warn('[SKIP] No id - skipping this item');
        skippedCount++;
        continue;
      }

      const bodyHtml = page.body?.storage?.value;
      if (!bodyHtml) {
        logger.warn(`[SKIP] No body (id=${page.id})`);
        skippedCount++;
        continue;
      }

      const safeTitle = safeFilename(page.title);
      const outDir = buildOutputDir(page, outputRoot, spaceName, pageLookup);
      const htmlDoc = buildHtmlDoc(page, spaceName, pageLookup);
      const pdfPath = path.join(outDir, `${page.id}_${safeTitle}.pdf`);

      try {
        const browserPage = await browser.newPage();
        await browserPage.setContent(htmlDoc, { waitUntil: 'networkidle0' });
        await browserPage.pdf({
          path: pdfPath,
          format: 'A4',
          margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' },
          printBackground: true,
        });
        await browserPage.close();
        pdfCount++;
        logger.info(`Written: ${path.basename(pdfPath)}`);
      } catch (e) {
        logger.warn(`[WARN] PDF conversion failed (id=${page.id}): ${e}`);
        skippedCount++;
      }
    }
  } finally {
    await browser.close();
  }

  return { pdfCount, skippedCount };
}

export interface ParseResults {
  html?: HtmlResult;
  markdown?: MarkdownResult;
  pdf?: PdfResult;
}

export async function parsePages(
  pages: Page[],
  outputRoot: string,
  outputFormat: 'html' | 'markdown' | 'pdf' | 'both' | 'all',
  spaceName: string
): Promise<ParseResults> {
  const results: ParseResults = {};

  if (['html', 'both', 'all'].includes(outputFormat)) {
    const htmlOutput = path.join(outputRoot, 'html');
    const htmlResult = convertToHtml(pages, htmlOutput, spaceName);
    results.html = htmlResult;
    logger.info(`HTML conversion complete: ${htmlResult.htmlCount} HTML, ${htmlResult.jsonCount} JSON`);
  }

  if (['markdown', 'both', 'all'].includes(outputFormat)) {
    const mdOutput = path.join(outputRoot, 'markdown');
    const mdResult = convertToMarkdown(pages, mdOutput, spaceName);
    results.markdown = mdResult;
    logger.info(`Markdown conversion complete: ${mdResult.mdCount} MD, ${mdResult.skippedCount} skipped`);
  }

  if (['pdf', 'all'].includes(outputFormat)) {
    const pdfOutput = path.join(outputRoot, 'pdf');
    const pdfResult = await convertToPdf(pages, pdfOutput, spaceName);
    results.pdf = pdfResult;
    logger.info(`PDF conversion complete: ${pdfResult.pdfCount} PDF, ${pdfResult.skippedCount} skipped`);
  }

  return results;
}

// For preview in web UI - convert Confluence storage to clean HTML/Markdown
export function getPagePreview(page: Page): { html: string; markdown: string } {
  const bodyStorage = page.body?.storage?.value || '';

  // Convert to markdown
  const markdown = confluenceCodeMacroToFence(bodyStorage);

  // Convert markdown to HTML for display
  const html = marked.parse(markdown) as string;

  return { html, markdown };
}
