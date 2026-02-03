import path from 'path';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import { config } from '../config.js';
import { setupLogger } from '../utils/logger.js';
import { safeFilename, ensureDir, writeFile, writeJson } from '../utils/fileUtils.js';
import { getConfluenceClient } from './confluenceClient.js';
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

// Turndown for HTML to Markdown conversion with GFM support
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

// Enable GFM (GitHub Flavored Markdown) - tables, strikethrough, etc.
turndownService.use(gfm);

// Disable markdown special character escaping
// Confluence HTML is already properly structured, no additional escaping needed
turndownService.escape = (text: string) => text;

// ============================================================================
// Confluence Macro Regexes
// ============================================================================

// Code macro
const CODE_MACRO_REGEX =
  /<ac:structured-macro[^>]*ac:name="code"[^>]*>[\s\S]*?(?:<ac:parameter[^>]*ac:name="language"[^>]*>\s*([^<]+?)\s*<\/ac:parameter>)?[\s\S]*?<ac:plain-text-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>[\s\S]*?<\/ac:structured-macro>/g;

// Image macros
const AC_IMAGE_URL_REGEX =
  /<ac:image[^>]*>[\s\S]*?<ri:url\s+ri:value="([^"]+)"[^/]*\/>[\s\S]*?<\/ac:image>/g;
const AC_IMAGE_ATTACHMENT_REGEX =
  /<ac:image[^>]*>[\s\S]*?<ri:attachment\s+ri:filename="([^"]+)"[^/]*\/>[\s\S]*?<\/ac:image>/g;

// Expand macro
const EXPAND_MACRO_REGEX =
  /<ac:structured-macro[^>]*ac:name="expand"[^>]*>[\s\S]*?(?:<ac:parameter[^>]*ac:name="title"[^>]*>([^<]*)<\/ac:parameter>)?[\s\S]*?<ac:rich-text-body>([\s\S]*?)<\/ac:rich-text-body>[\s\S]*?<\/ac:structured-macro>/g;

// TOC macro
const TOC_MACRO_REGEX =
  /<ac:structured-macro[^>]*ac:name="toc"[^>]*>[\s\S]*?<\/ac:structured-macro>/g;

// View-file macro
const VIEW_FILE_MACRO_REGEX =
  /<ac:structured-macro[^>]*ac:name="view-file"[^>]*>[\s\S]*?<ri:attachment\s+ri:filename="([^"]+)"[^/]*\/>[\s\S]*?<\/ac:structured-macro>/g;

// Language aliases for highlight.js
const LANGUAGE_ALIASES: Record<string, string> = {
  'c#': 'csharp',
  'c++': 'cpp',
  'js': 'javascript',
  'ts': 'typescript',
  'py': 'python',
  'rb': 'ruby',
  'yml': 'yaml',
  'sh': 'bash',
  'shell': 'bash',
};

// ============================================================================
// Helper Functions
// ============================================================================

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Build page map (id → Page)
function buildPageMap(pages: Page[]): Map<string, Page> {
  const map = new Map<string, Page>();
  for (const page of pages) {
    map.set(page.id, page);
  }
  return map;
}

// Get ancestor chain from root to current page
function getAncestorChain(pageId: string, pageMap: Map<string, Page>): Array<{ id: string; title: string }> {
  const ancestors: Array<{ id: string; title: string }> = [];
  let currentId: string | null = pageId;

  while (currentId) {
    const page = pageMap.get(currentId);
    if (!page) break;
    ancestors.unshift({ id: page.id, title: page.title });
    currentId = page.parentId;
  }

  return ancestors;
}

// Build hierarchical output path for a page
function buildPageOutputPath(page: Page, outputRoot: string, pageMap: Map<string, Page>): string {
  const ancestors = getAncestorChain(page.id, pageMap);
  let pagePath = path.join(outputRoot, 'pages');

  for (const ancestor of ancestors) {
    const folderName = `${ancestor.id}_${safeFilename(ancestor.title)}`;
    pagePath = path.join(pagePath, folderName);
  }

  ensureDir(pagePath);
  return pagePath;
}

// ============================================================================
// Confluence Macro Converters
// ============================================================================

// Convert code macros to HTML with syntax highlighting
export function confluenceCodeMacroToHtml(htmlContent: string): string {
  return htmlContent.replace(
    CODE_MACRO_REGEX,
    (_match: string, lang: string | undefined, body: string | undefined) => {
      const language = (lang || '').trim().toLowerCase();
      const code = (body || '').replace(/\r\n/g, '\n');
      const mappedLang = LANGUAGE_ALIASES[language] || language;

      let highlighted: string;
      try {
        if (mappedLang && hljs.getLanguage(mappedLang)) {
          highlighted = hljs.highlight(code, { language: mappedLang }).value;
        } else if (language) {
          highlighted = hljs.highlightAuto(code).value;
        } else {
          highlighted = escapeHtml(code);
        }
      } catch {
        highlighted = escapeHtml(code);
      }

      const langClass = mappedLang ? ` class="language-${mappedLang}"` : '';
      return `<pre><code${langClass}>${highlighted}</code></pre>`;
    }
  );
}

// Clean Confluence-specific HTML for better Markdown conversion
function cleanConfluenceHtmlForMarkdown(html: string): string {
  let cleaned = html;

  // Remove <p> tags inside <th> and <td> (Confluence wraps cell content in <p>)
  // This prevents Turndown from adding extra newlines in tables
  cleaned = cleaned.replace(/<(th|td)([^>]*)>\s*<p[^>]*>([\s\S]*?)<\/p>\s*<\/(th|td)>/gi, '<$1$2>$3</$4>');

  // Remove Confluence-specific attributes that might interfere
  cleaned = cleaned.replace(/\s+(local-id|ac:local-id|data-table-width|data-layout)="[^"]*"/gi, '');

  // Clean up <br /> inside table cells
  cleaned = cleaned.replace(/(<(th|td)[^>]*>[\s\S]*?)<br\s*\/?>([\s\S]*?<\/(th|td)>)/gi, '$1 $3');

  return cleaned;
}

// Convert code macros to markdown fenced code blocks
export function confluenceCodeMacroToFence(htmlContent: string): string {
  const codeBlocks: string[] = [];

  const withPlaceholders = htmlContent.replace(
    CODE_MACRO_REGEX,
    (_match: string, lang: string | undefined, body: string | undefined) => {
      const language = (lang || '').trim();
      const code = (body || '').replace(/\r\n/g, '\n').trimEnd();
      const block = language
        ? `\n\`\`\`${language}\n${code}\n\`\`\`\n`
        : `\n\`\`\`\n${code}\n\`\`\`\n`;
      codeBlocks.push(block);
      return `<span>CODEBLOCKPLACEHOLDER${codeBlocks.length - 1}ENDCODEBLOCK</span>`;
    }
  );

  // Clean Confluence-specific HTML before Turndown conversion
  const cleanedHtml = cleanConfluenceHtmlForMarkdown(withPlaceholders);

  let markdown = turndownService.turndown(cleanedHtml);

  codeBlocks.forEach((block, i) => {
    markdown = markdown.replace(`CODEBLOCKPLACEHOLDER${i}ENDCODEBLOCK`, block);
  });

  return markdown;
}

// Convert image macros to HTML img tags
export function convertAcImageToImg(htmlContent: string, attachmentsBasePath: string = ''): string {
  // External URL images
  let content = htmlContent.replace(AC_IMAGE_URL_REGEX, (_match, url) => {
    const escapedUrl = url.replace(/"/g, '&quot;');
    return `<img src="${escapedUrl}" alt="image" style="max-width: 100%;" loading="lazy" />`;
  });

  // Attachment images
  content = content.replace(AC_IMAGE_ATTACHMENT_REGEX, (_match, filename) => {
    const escapedFilename = filename.replace(/"/g, '&quot;');
    const src = attachmentsBasePath
      ? `${attachmentsBasePath}/${encodeURIComponent(filename)}`
      : `./attachments/${encodeURIComponent(filename)}`;
    return `<img src="${src}" alt="${escapedFilename}" style="max-width: 100%;" loading="lazy" />`;
  });

  return content;
}

// Convert expand macro to details/summary
function convertExpandMacro(html: string): string {
  return html.replace(EXPAND_MACRO_REGEX, (_m, title, body) => {
    const safeTitle = title ? escapeHtml(title) : 'Details';
    return `<details><summary>${safeTitle}</summary>${body || ''}</details>`;
  });
}

// Convert callout macros (info, tip, note, warning, panel)
function convertCalloutMacros(html: string): string {
  const types = ['info', 'tip', 'note', 'warning', 'panel'];
  for (const type of types) {
    const regex = new RegExp(
      `<ac:structured-macro[^>]*ac:name="${type}"[^>]*>[\\s\\S]*?<ac:rich-text-body>([\\s\\S]*?)<\\/ac:rich-text-body>[\\s\\S]*?<\\/ac:structured-macro>`,
      'g'
    );
    html = html.replace(regex, (_m, body) => {
      return `<div class="callout callout-${type}">${body || ''}</div>`;
    });
  }
  return html;
}

// Remove TOC macro (not needed in local HTML)
function removeTocMacro(html: string): string {
  return html.replace(TOC_MACRO_REGEX, '<!-- TOC removed -->');
}

// Convert view-file macro to download link
function convertViewFileMacro(
  html: string,
  attachmentsPath: string = './attachments',
  showRelativePath: boolean = false,
  disableLink: boolean = false
): string {
  // For file:// URLs (PDF), don't encode filename - Puppeteer handles raw paths better
  // For relative/http URLs (HTML), encode for browser compatibility
  const isFileUrl = attachmentsPath.startsWith('file://');

  return html.replace(VIEW_FILE_MACRO_REGEX, (_m, filename) => {
    const escapedFilename = escapeHtml(filename);
    const relativePath = `./attachments/${filename}`;

    // PDF mode: show text only without hyperlink (file:// links don't work after temp cleanup)
    if (disableLink) {
      return (
        `<span class="attachment-link">📎 ${escapedFilename}</span>` +
        `<br/><small style="color: #666; font-size: 7pt;">(${relativePath})</small>`
      );
    }

    const href = isFileUrl
      ? `${attachmentsPath}/${filename}`
      : `${attachmentsPath}/${encodeURIComponent(filename)}`;

    if (showRelativePath) {
      return (
        `<a href="${href}" class="attachment-link">📎 ${escapedFilename}</a>` +
        `<br/><small style="color: #666; font-size: 7pt;">(${relativePath})</small>`
      );
    }
    return `<a href="${href}" class="attachment-link">📎 ${escapedFilename}</a>`;
  });
}

// Process all Confluence macros
function processConfluenceHtml(html: string, attachmentsPath: string): string {
  let processed = html;
  processed = confluenceCodeMacroToHtml(processed);
  processed = convertAcImageToImg(processed, attachmentsPath);
  processed = convertExpandMacro(processed);
  processed = convertCalloutMacros(processed);
  processed = convertViewFileMacro(processed, attachmentsPath);
  processed = removeTocMacro(processed);
  return processed;
}

// Convert image macros for PDF (absolute file:// paths for images)
function convertAcImageToImgForPdf(htmlContent: string, absoluteAttachmentsPath: string): string {
  // Normalize path separators to forward slashes (Windows compatibility)
  const normalizedPath = absoluteAttachmentsPath.replace(/\\/g, '/');

  // External URL images - keep as-is
  let content = htmlContent.replace(AC_IMAGE_URL_REGEX, (_match, url) => {
    const escapedUrl = url.replace(/"/g, '&quot;');
    return `<img src="${escapedUrl}" alt="image" style="max-width: 100%;" />`;
  });

  // Attachment images - use file:// absolute path WITHOUT URL encoding
  // Puppeteer handles raw filenames better than percent-encoded ones (like Python/WeasyPrint)
  content = content.replace(AC_IMAGE_ATTACHMENT_REGEX, (_match, filename) => {
    const escapedFilename = filename.replace(/"/g, '&quot;');
    // Construct proper file:// URL - Linux paths start with /, Windows paths don't
    // Linux: file:// + /path = file:///path (3 slashes total)
    // Windows: file:/// + C:/path = file:///C:/path (3 slashes total)
    const absoluteSrc = normalizedPath.startsWith('/')
      ? `file://${normalizedPath}/${filename}`
      : `file:///${normalizedPath}/${filename}`;
    return `<img src="${absoluteSrc}" alt="${escapedFilename}" style="max-width: 100%;" />`;
  });

  return content;
}

// Process Confluence macros for PDF (images with absolute paths, attachment links as text only)
function processConfluenceHtmlForPdf(html: string, absoluteAttachmentsPath: string): string {
  let processed = html;
  processed = confluenceCodeMacroToHtml(processed);
  processed = convertAcImageToImgForPdf(processed, absoluteAttachmentsPath);
  processed = convertExpandMacro(processed);
  processed = convertCalloutMacros(processed);
  // Disable hyperlinks for attachments in PDF - show text with relative path only
  // file:// links to temp directory become invalid after PDF generation cleanup
  processed = convertViewFileMacro(processed, '', true, true);
  processed = removeTocMacro(processed);
  return processed;
}

// ============================================================================
// HTML Document Builder
// ============================================================================

function buildHtmlDoc(
  page: Page,
  spaceName: string,
  pageMap: Map<string, Page>,
  attachmentsDir: string = './attachments'
): string {
  const titleSafe = escapeHtml(page.title || '');
  const bodyHtml = processConfluenceHtml(page.body?.storage?.value || '', attachmentsDir);
  return buildHtmlDocInternal(page, spaceName, pageMap, bodyHtml);
}

// Build HTML for PDF with absolute file:// paths for images and PDF-specific styles
function buildHtmlDocForPdf(
  page: Page,
  spaceName: string,
  pageMap: Map<string, Page>,
  absoluteAttachmentsPath: string
): string {
  const titleSafe = escapeHtml(page.title || '');
  const spaceNameSafe = escapeHtml(spaceName);
  const parentName = page.parentId ? escapeHtml(pageMap.get(page.parentId)?.title || '') : '';
  const parentDisplay = page.parentId
    ? `${page.parentId} (${parentName || 'Unknown'})`
    : '- (Root)';
  const spaceDisplay = `${page.spaceId} (${spaceNameSafe || 'Unknown'})`;
  const bodyHtml = processConfluenceHtmlForPdf(page.body?.storage?.value || '', absoluteAttachmentsPath);

  // PDF-specific CSS (no Tailwind CDN - matching Python version font sizes)
  return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="utf-8" />
    <title>${titleSafe}</title>
    <style>
      @page { size: A4; margin: 5mm; }

      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
                     "Noto Sans KR", "Malgun Gothic", sans-serif;
        font-size: 9pt;
        line-height: 1.4;
        color: #111111;
        margin: 0;
        padding: 0.5rem;
      }

      h1 { font-size: 14pt; margin: 0 0 0.3rem 0; }
      h2 { font-size: 12pt; margin: 0.5rem 0 0.3rem 0; }
      h3 { font-size: 10pt; margin: 0.4rem 0 0.2rem 0; }
      h4, h5, h6 { font-size: 9pt; margin: 0.3rem 0 0.2rem 0; }

      p { margin: 0.3rem 0; }

      code {
        background: #f2f2f5;
        padding: 0.05rem 0.15rem;
        font-family: "JetBrains Mono", "Fira Code", Consolas, monospace;
        font-size: 7pt;
        border-radius: 2px;
      }

      pre {
        background: #1e1e1e;
        padding: 0.3rem;
        border-radius: 4px;
        margin: 0.3rem 0;
        overflow-x: auto;
      }

      pre code {
        display: block;
        background: transparent;
        color: #eaeaea;
        font-size: 6.5pt;
        white-space: pre-wrap;
        padding: 0;
      }

      table {
        border-collapse: collapse;
        width: 100%;
        table-layout: fixed;
        font-size: 7pt;
        margin: 0.3rem 0;
      }

      th, td {
        border: 1px solid #ddd;
        padding: 2px 4px;
        text-align: left;
        word-break: break-word;
      }

      th { background: #f5f5f5; }

      img { max-width: 100%; height: auto; }

      a { color: #0066cc; word-break: break-all; }

      .callout {
        font-size: 8pt;
        margin: 0.3rem 0;
        padding: 0.3rem;
        border-left: 3px solid;
        border-radius: 4px;
      }
      .callout-info { background-color: #e7f3ff; border-left-color: #0066cc; }
      .callout-tip { background-color: #e6f7e6; border-left-color: #28a745; }
      .callout-note { background-color: #fff8e6; border-left-color: #ffc107; }
      .callout-warning { background-color: #ffebe6; border-left-color: #dc3545; }
      .callout-panel { background-color: #f5f5f7; border-left-color: #6c757d; }

      details { margin: 0.3rem 0; }
      details summary { cursor: pointer; font-weight: 600; padding: 0.25rem; background: #f5f5f7; border-radius: 4px; font-size: 8pt; }
      details[open] summary { margin-bottom: 0.25rem; }

      .attachment-link { display: inline-flex; align-items: center; gap: 0.15rem; color: #0066cc; font-size: 8pt; }

      .meta { font-size: 7pt; color: #666; margin-bottom: 0.5rem; }
      .footer { font-size: 6pt; color: #888; margin-top: 0.5rem; border-top: 1px solid #ddd; padding-top: 0.25rem; }
    </style>
</head>
<body>
  <h1>${titleSafe}</h1>
  <div class="meta">
    ID: ${page.id} | Space: ${spaceDisplay} | Parent: ${parentDisplay} | ${page.createdAt}
  </div>
  <div>${bodyHtml}</div>
  <div class="footer">Exported from Confluence</div>
</body>
</html>`;
}

function buildHtmlDocInternal(
  page: Page,
  spaceName: string,
  pageMap: Map<string, Page>,
  bodyHtml: string
): string {
  const titleSafe = escapeHtml(page.title || '');
  const spaceNameSafe = escapeHtml(spaceName);
  const parentName = page.parentId ? escapeHtml(pageMap.get(page.parentId)?.title || '') : '';
  const parentDisplay = page.parentId
    ? `${page.parentId} (${parentName || 'Unknown'})`
    : '- (Root)';
  const spaceDisplay = `${page.spaceId} (${spaceNameSafe || 'Unknown'})`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${titleSafe}</title>
    <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
    <style>
      /* Callout styles */
      .callout { padding: 1rem; border-radius: 8px; margin: 1rem 0; border-left: 4px solid; }
      .callout-info { background-color: #e7f3ff; border-left-color: #0066cc; }
      .callout-tip { background-color: #e6f7e6; border-left-color: #28a745; }
      .callout-note { background-color: #fff8e6; border-left-color: #ffc107; }
      .callout-warning { background-color: #ffebe6; border-left-color: #dc3545; }
      .callout-panel { background-color: #f5f5f7; border-left-color: #6c757d; }
      .attachment-link { display: inline-flex; align-items: center; gap: 0.25rem; color: #0066cc; }
      details { margin: 1rem 0; }
      details summary { cursor: pointer; font-weight: 600; padding: 0.5rem; background: #f5f5f7; border-radius: 4px; }
      details[open] summary { margin-bottom: 0.5rem; }
    </style>
</head>
<body class="bg-gray-50 text-gray-900 p-8">
    <div class="max-w-4xl mx-auto">
        <header class="mb-6">
            <h1 class="text-3xl font-bold mb-2">${titleSafe}</h1>
            <div class="text-sm text-gray-500 flex flex-wrap gap-4">
                <span><strong>ID</strong> ${page.id}</span>
                <span><strong>Space</strong> ${spaceDisplay}</span>
                <span><strong>Parent</strong> ${parentDisplay}</span>
                <span><strong>Status</strong> ${page.status}</span>
                <span><strong>Created</strong> ${page.createdAt}</span>
            </div>
        </header>

        <main class="prose max-w-none bg-white rounded-xl p-6 shadow-sm">
${bodyHtml}
        </main>

        <footer class="mt-8 text-center text-sm text-gray-400 border-t pt-4">
            Exported from Confluence space ${spaceDisplay} · Local backup view
        </footer>
    </div>
</body>
</html>
`;
}

// ============================================================================
// Conversion Functions (New Hierarchical Structure)
// ============================================================================

export interface ConvertResult {
  pagesProcessed: number;
  htmlCount: number;
  mdCount: number;
  pdfCount: number;
  attachmentsDownloaded: number;
  attachmentsFailed: number;
}

export async function convertPages(
  pages: Page[],
  outputRoot: string,
  spaceName: string,
  formats: { html?: boolean; markdown?: boolean; pdf?: boolean }
): Promise<ConvertResult> {
  const pageMap = buildPageMap(pages);
  const client = getConfluenceClient();

  // Create _meta directory and save pages.json
  const metaDir = path.join(outputRoot, '_meta');
  ensureDir(metaDir);
  writeJson(path.join(metaDir, 'pages.json'), pages);
  logger.info(`Saved ${pages.length} pages to _meta/pages.json`);

  let pagesProcessed = 0;
  let htmlCount = 0;
  let mdCount = 0;
  let pdfCount = 0;
  let attachmentsDownloaded = 0;
  let attachmentsFailed = 0;

  // Lazy load puppeteer only if PDF is needed
  let browser: Awaited<ReturnType<typeof import('puppeteer').launch>> | null = null;
  if (formats.pdf) {
    const puppeteer = await import('puppeteer');
    // Enable file:// access for local images in PDF
    browser = await puppeteer.default.launch({
      headless: true,
      args: ['--allow-file-access-from-files', '--disable-web-security'],
    });
  }

  try {
    for (const page of pages) {
      if (!page.id) {
        logger.warn('[SKIP] No id - skipping this item');
        continue;
      }

      const pageDir = buildPageOutputPath(page, outputRoot, pageMap);
      const attachmentsDir = path.join(pageDir, 'attachments');

      // Download attachments
      ensureDir(attachmentsDir);
      const attachResult = await client.downloadAttachments(page.id, attachmentsDir);
      attachmentsDownloaded += attachResult.downloaded;
      attachmentsFailed += attachResult.failed;

      // Save meta.json
      writeJson(path.join(pageDir, 'meta.json'), page);

      const bodyStorage = page.body?.storage?.value;
      if (!bodyStorage) {
        logger.warn(`[WARN] No body.storage.value (id=${page.id}) - meta only`);
        pagesProcessed++;
        continue;
      }

      // Generate HTML
      if (formats.html) {
        const htmlDoc = buildHtmlDoc(page, spaceName, pageMap, './attachments');
        writeFile(path.join(pageDir, 'page.html'), htmlDoc);
        htmlCount++;
      }

      // Generate Markdown
      if (formats.markdown) {
        const mdBody = confluenceCodeMacroToFence(bodyStorage);
        const parentName = page.parentId ? pageMap.get(page.parentId)?.title || '' : '';
        const parentInfo = page.parentId
          ? `${page.parentId} (${parentName || 'Unknown'})`
          : '- (Root)';
        const spaceInfo = `${page.spaceId} (${spaceName || 'Unknown'})`;

        let mdContent = `# ${page.title}\n\n`;
        mdContent += `<!-- id: ${page.id} | space: ${spaceInfo} | parent: ${parentInfo} | status: ${page.status} -->\n\n`;
        mdContent += mdBody;

        writeFile(path.join(pageDir, 'page.md'), mdContent);
        mdCount++;
      }

      // Generate PDF
      if (formats.pdf && browser) {
        try {
          // Use absolute file:// path for images in PDF
          const absoluteAttachmentsPath = path.resolve(attachmentsDir);
          const htmlDoc = buildHtmlDocForPdf(page, spaceName, pageMap, absoluteAttachmentsPath);

          // Save HTML to temp file for proper file:// URL resolution
          // Using goto('file://...') instead of setContent() allows Puppeteer to load local images
          const tempHtmlPath = path.join(pageDir, '_temp_pdf.html');
          writeFile(tempHtmlPath, htmlDoc);

          const browserPage = await browser.newPage();

          // Navigate to the local HTML file (this enables proper file:// URL resolution)
          await browserPage.goto(`file://${tempHtmlPath}`, { waitUntil: 'networkidle0' });

          // Wait for all images to load
          await browserPage.evaluate(async () => {
            const images = document.querySelectorAll('img');
            await Promise.all(
              Array.from(images).map((img) => {
                if (img.complete) return Promise.resolve();
                return new Promise((resolve) => {
                  img.onload = resolve;
                  img.onerror = resolve;
                  // Timeout fallback after 5 seconds
                  setTimeout(resolve, 5000);
                });
              })
            );
          });

          await browserPage.pdf({
            path: path.join(pageDir, 'page.pdf'),
            format: 'A4',
            margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' },
            printBackground: true,
          });
          await browserPage.close();

          // Clean up temp file
          const fs = await import('fs');
          fs.unlinkSync(tempHtmlPath);

          pdfCount++;
        } catch (e) {
          logger.warn(`[WARN] PDF conversion failed (id=${page.id}): ${e}`);
        }
      }

      pagesProcessed++;
      logger.info(`Processed: ${page.id}_${safeFilename(page.title)}`);
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return {
    pagesProcessed,
    htmlCount,
    mdCount,
    pdfCount,
    attachmentsDownloaded,
    attachmentsFailed,
  };
}

// ============================================================================
// Legacy Functions (kept for backward compatibility)
// ============================================================================

export interface HtmlResult {
  htmlCount: number;
  jsonCount: number;
  attachmentsDownloaded: number;
  attachmentsFailed: number;
}

export interface MarkdownResult {
  mdCount: number;
  skippedCount: number;
}

export interface PdfResult {
  pdfCount: number;
  skippedCount: number;
}

export interface ParseResults {
  html?: HtmlResult;
  markdown?: MarkdownResult;
  pdf?: PdfResult;
}

// Legacy parsePages function - now uses new convertPages internally
export async function parsePages(
  pages: Page[],
  outputRoot: string,
  outputFormat: 'html' | 'markdown' | 'pdf' | 'both' | 'all',
  spaceName: string
): Promise<ParseResults> {
  const formats = {
    html: ['html', 'both', 'all'].includes(outputFormat),
    markdown: ['markdown', 'both', 'all'].includes(outputFormat),
    pdf: ['pdf', 'all'].includes(outputFormat),
  };

  const result = await convertPages(pages, outputRoot, spaceName, formats);

  const results: ParseResults = {};

  if (formats.html) {
    results.html = {
      htmlCount: result.htmlCount,
      jsonCount: result.pagesProcessed,
      attachmentsDownloaded: result.attachmentsDownloaded,
      attachmentsFailed: result.attachmentsFailed,
    };
  }

  if (formats.markdown) {
    results.markdown = {
      mdCount: result.mdCount,
      skippedCount: result.pagesProcessed - result.mdCount,
    };
  }

  if (formats.pdf) {
    results.pdf = {
      pdfCount: result.pdfCount,
      skippedCount: result.pagesProcessed - result.pdfCount,
    };
  }

  return results;
}

// ============================================================================
// Preview Function for Web UI
// ============================================================================

export function getPagePreview(page: Page): { html: string; markdown: string } {
  const bodyStorage = page.body?.storage?.value || '';
  const attachmentsPath = `/api/attachments/${page.id}`;

  const html = processConfluenceHtml(bodyStorage, attachmentsPath);
  const markdown = confluenceCodeMacroToFence(bodyStorage);

  return { html, markdown };
}
