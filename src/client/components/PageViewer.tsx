import { useState, useEffect } from 'react';
import { Page, api } from '../services/api';
import MarkdownRenderer from './MarkdownRenderer';

interface Props {
  page: Page;
}

export default function PageViewer({ page }: Props) {
  const [viewMode, setViewMode] = useState<'markdown' | 'html' | 'raw'>('markdown');
  const [preview, setPreview] = useState<{ html: string; markdown: string } | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div style={{ marginTop: '1rem' }}>
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
          <span>{page.parentId || '-'}</span>
        </div>
        <div className="page-meta-item">
          <span className="page-meta-label">Status:</span>
          <span>{page.status}</span>
        </div>
        <div className="page-meta-item">
          <span className="page-meta-label">Created:</span>
          <span>{new Date(page.createdAt).toLocaleString()}</span>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button
            className={`btn ${viewMode === 'markdown' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('markdown')}
          >
            Markdown
          </button>
          <button
            className={`btn ${viewMode === 'html' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('html')}
          >
            HTML
          </button>
          <button
            className={`btn ${viewMode === 'raw' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('raw')}
          >
            Raw Storage
          </button>
        </div>

        <h2 style={{ marginBottom: '1rem' }}>{page.title}</h2>

        {loading ? (
          <div className="loading">Loading preview...</div>
        ) : viewMode === 'markdown' && preview ? (
          <MarkdownRenderer content={preview.markdown} />
        ) : viewMode === 'html' && preview ? (
          <div
            className="markdown-body"
            dangerouslySetInnerHTML={{ __html: preview.html }}
          />
        ) : (
          <pre
            style={{
              background: 'var(--bg-primary)',
              padding: '1rem',
              borderRadius: '6px',
              overflow: 'auto',
              fontSize: '0.875rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {page.body?.storage?.value || 'No content'}
          </pre>
        )}
      </div>
    </div>
  );
}
