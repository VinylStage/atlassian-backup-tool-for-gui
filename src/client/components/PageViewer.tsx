import { useState, useEffect } from 'react';
import { Page, api } from '../services/api';
import MarkdownRenderer from './MarkdownRenderer';

interface Props {
  page: Page;
}

export default function PageViewer({ page }: Props) {
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');
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
        {/* View mode toggle - simplified to Preview/Raw */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
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

        {/* Title */}
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', fontWeight: 600 }}>
          {page.title}
        </h2>

        {/* Content */}
        {loading ? (
          <div className="loading">Loading preview...</div>
        ) : viewMode === 'preview' && preview ? (
          <MarkdownRenderer content={preview.markdown} />
        ) : (
          <pre
            style={{
              background: 'var(--color-bg-primary)',
              padding: '1rem',
              borderRadius: '6px',
              overflow: 'auto',
              fontSize: '0.75rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '600px',
            }}
          >
            {page.body?.storage?.value || 'No content'}
          </pre>
        )}
      </div>
    </div>
  );
}
