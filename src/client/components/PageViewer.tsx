import { useState, useEffect } from 'react';
import { Page, api } from '../services/api';
import { useStore } from '../store/useStore';

interface Props {
  page: Page;
}

export default function PageViewer({ page }: Props) {
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');
  const [preview, setPreview] = useState<{ html: string; markdown: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Download state
  const [formats, setFormats] = useState({ html: true, md: true, pdf: false });
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Get space name from store
  const selectedSpace = useStore((state) => state.selectedSpace);

  useEffect(() => {
    loadPreview();
  }, [page.id]);

  async function loadPreview() {
    try {
      setLoading(true);
      const data = await api.getPagePreview(page.id);
      setPreview(data);
    } catch (err) {
      console.error('Failed to load preview:', err);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    if (!formats.html && !formats.md && !formats.pdf) {
      setDownloadError('Select at least one format');
      return;
    }

    try {
      setDownloading(true);
      setDownloadError(null);
      await api.downloadPage(page.id, selectedSpace?.name || '', formats);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      {/* Page metadata */}
      <div className="page-meta">
        <div className="page-meta-item">
          <span className="page-meta-label">ID:</span>
          <span>{page.id}</span>
        </div>
        <div className="page-meta-item">
          <span className="page-meta-label">Space:</span>
          <span>{page.spaceId}</span>
        </div>
        <div className="page-meta-item">
          <span className="page-meta-label">Parent:</span>
          <span>{page.parentId || 'Root'}</span>
        </div>
        <div className="page-meta-item">
          <span className="page-meta-label">Status:</span>
          <span>{page.status}</span>
        </div>
      </div>

      {/* Content card */}
      <div className="card">
        {/* View mode toggle */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <button
            className={`btn ${viewMode === 'preview' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('preview')}
          >
            Preview
          </button>
          <button
            className={`btn ${viewMode === 'raw' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('raw')}
          >
            Raw
          </button>
        </div>

        {/* Download controls */}
        <div className="download-controls">
          <label className="format-checkbox">
            <input
              type="checkbox"
              checked={formats.html}
              onChange={(e) => setFormats({ ...formats, html: e.target.checked })}
            />
            <span className="format-label">HTML</span>
          </label>
          <label className="format-checkbox">
            <input
              type="checkbox"
              checked={formats.md}
              onChange={(e) => setFormats({ ...formats, md: e.target.checked })}
            />
            <span className="format-label">MD</span>
          </label>
          <label className="format-checkbox">
            <input
              type="checkbox"
              checked={formats.pdf}
              onChange={(e) => setFormats({ ...formats, pdf: e.target.checked })}
            />
            <span className="format-label">PDF</span>
          </label>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleDownload}
            disabled={downloading || (!formats.html && !formats.md && !formats.pdf)}
          >
            {downloading ? 'Downloading...' : 'Download'}
          </button>
        </div>

        {downloadError && (
          <div className="error-message" style={{ marginBottom: '0.5rem', fontSize: '0.75rem' }}>
            {downloadError}
          </div>
        )}

        {/* Title */}
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', fontWeight: 600 }}>
          {page.title}
        </h2>

        {/* Content */}
        {loading ? (
          <div className="loading">Loading preview...</div>
        ) : viewMode === 'preview' && preview ? (
          <div
            className="prose"
            dangerouslySetInnerHTML={{ __html: preview.html }}
            style={{
              padding: '1rem',
              backgroundColor: 'var(--color-bg-secondary)',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
            }}
          />
        ) : (
          <pre className="raw-view">
            {page.body?.storage?.value || 'No content'}
          </pre>
        )}
      </div>
    </div>
  );
}
