export interface Space {
  id: string;
  name: string;
  key: string;
}

export interface Page {
  id: string;
  title: string;
  spaceId: string;
  parentId: string | null;
  parentType: 'space' | 'page';
  status: string;
  createdAt: string;
  body?: {
    storage?: {
      value: string;
    };
  };
}

export interface TreeNode {
  id: string;
  title: string;
  children: TreeNode[];
}

export interface TreeStats {
  totalPages: number;
  rootPages: number;
  maxDepth: number;
}

export interface TreeResponse {
  tree: TreeNode[];
  stats: TreeStats;
}

export type BackupFormat = 'html' | 'markdown' | 'pdf' | 'html+md' | 'html+pdf' | 'md+pdf' | 'all';
export type BackupLevel = 'space' | 'folder' | 'page';

export interface BackupRequest {
  spaceId: string;
  spaceName: string;
  format: BackupFormat;
  level: BackupLevel;
  targetIds?: string[];  // Required when level is 'folder' or 'page'
}

export interface BackupResult {
  success: boolean;
  outputPath: string;
  results: {
    html?: { htmlCount: number; jsonCount: number };
    markdown?: { mdCount: number; skippedCount: number };
    pdf?: { pdfCount: number; skippedCount: number };
  };
}

const BASE_URL = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${url}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  async getSpaces(): Promise<Space[]> {
    const data = await fetchJson<{ spaces: Space[] }>('/spaces');
    return data.spaces;
  },

  async getPages(spaceId: string): Promise<Page[]> {
    const data = await fetchJson<{ pages: Page[] }>(`/spaces/${spaceId}/pages`);
    return data.pages;
  },

  async getTree(spaceId: string): Promise<TreeResponse> {
    return fetchJson<TreeResponse>(`/spaces/${spaceId}/tree`);
  },

  async getPagePreview(pageId: string): Promise<{ html: string; markdown: string }> {
    return fetchJson(`/pages/${pageId}/preview`);
  },

  async startBackup(request: BackupRequest): Promise<BackupResult> {
    return fetchJson<BackupResult>('/backup', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  async downloadPage(
    pageId: string,
    spaceName: string,
    formats: { html?: boolean; md?: boolean; pdf?: boolean }
  ): Promise<void> {
    const response = await fetch(`${BASE_URL}/pages/${pageId}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formats, spaceName }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Download failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    // Get filename from Content-Disposition header or use default
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = `page_${pageId}.zip`;
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match) filename = match[1];
    }

    // Download the blob
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};
