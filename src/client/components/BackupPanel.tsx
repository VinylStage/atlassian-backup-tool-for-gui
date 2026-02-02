import { useState } from 'react';
import { Space, Page, api, BackupResult } from '../services/api';

interface Props {
  space: Space;
  pages: Page[];
}

type Format = 'html' | 'markdown' | 'pdf' | 'both' | 'all';

export default function BackupPanel({ space, pages }: Props) {
  const [format, setFormat] = useState<Format>('markdown');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BackupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleBackup() {
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const backupResult = await api.startBackup({
        spaceId: space.id,
        spaceName: space.name,
        format,
      });

      setResult(backupResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed');
    } finally {
      setLoading(false);
    }
  }

  const formats: { value: Format; label: string }[] = [
    { value: 'html', label: 'HTML' },
    { value: 'markdown', label: 'Markdown' },
    { value: 'pdf', label: 'PDF' },
    { value: 'both', label: 'HTML + MD' },
    { value: 'all', label: 'All' },
  ];

  return (
    <div className="card">
      <div className="card-title">Backup</div>

      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
          Output Format
        </div>
        <div className="format-selector">
          {formats.map((f) => (
            <button
              key={f.value}
              className={`format-btn ${format === f.value ? 'selected' : ''}`}
              onClick={() => setFormat(f.value)}
              disabled={loading}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <button
        className="btn btn-primary"
        style={{ width: '100%' }}
        onClick={handleBackup}
        disabled={loading || pages.length === 0}
      >
        {loading ? 'Backing up...' : `Backup ${pages.length} pages`}
      </button>

      {error && (
        <div className="error" style={{ marginTop: '1rem' }}>
          {error}
        </div>
      )}

      {result && (
        <div
          style={{
            marginTop: '1rem',
            padding: '1rem',
            background: 'var(--bg-primary)',
            borderRadius: '6px',
          }}
        >
          <div
            style={{
              color: result.success ? 'var(--success-color)' : 'var(--error-color)',
              fontWeight: 500,
              marginBottom: '0.5rem',
            }}
          >
            {result.success ? 'Backup completed!' : 'Backup failed'}
          </div>

          {result.outputPath && (
            <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              Output: <code>{result.outputPath}</code>
            </div>
          )}

          {result.results && (
            <div style={{ fontSize: '0.875rem' }}>
              {result.results.html && (
                <div>HTML: {result.results.html.htmlCount} files</div>
              )}
              {result.results.markdown && (
                <div>Markdown: {result.results.markdown.mdCount} files</div>
              )}
              {result.results.pdf && (
                <div>PDF: {result.results.pdf.pdfCount} files</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
