import { useState, useMemo } from 'react';
import { Space, Page, TreeNode, BackupFormat, BackupLevel, api, BackupResult } from '../services/api';

interface Props {
  space: Space;
  pages: Page[];
  tree: TreeNode[] | null;
}

// Collect all descendant page IDs from a tree node
function collectDescendantIds(node: TreeNode): string[] {
  const ids = [node.id];
  for (const child of node.children) {
    ids.push(...collectDescendantIds(child));
  }
  return ids;
}

// Flatten tree to get all nodes with their parent info
function flattenTree(nodes: TreeNode[], parentId: string | null = null): Array<{ node: TreeNode; parentId: string | null; hasChildren: boolean }> {
  const result: Array<{ node: TreeNode; parentId: string | null; hasChildren: boolean }> = [];
  for (const node of nodes) {
    result.push({ node, parentId, hasChildren: node.children.length > 0 });
    result.push(...flattenTree(node.children, node.id));
  }
  return result;
}

export default function BackupPanel({ space, pages, tree }: Props) {
  const [format, setFormat] = useState<BackupFormat>('markdown');
  const [level, setLevel] = useState<BackupLevel>('space');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BackupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Get selectable items based on level
  const selectableItems = useMemo(() => {
    if (!tree) return [];
    const flattened = flattenTree(tree);

    if (level === 'folder') {
      // Only show nodes that have children (folders)
      return flattened.filter(item => item.hasChildren);
    } else if (level === 'page') {
      // Show all nodes
      return flattened;
    }
    return [];
  }, [tree, level]);

  // Calculate target IDs for backup
  const targetIds = useMemo(() => {
    if (level === 'space') {
      return pages.map(p => p.id);
    }

    if (level === 'folder' && tree) {
      // For folders, include all descendants
      const ids = new Set<string>();
      const findNode = (nodes: TreeNode[], targetId: string): TreeNode | null => {
        for (const node of nodes) {
          if (node.id === targetId) return node;
          const found = findNode(node.children, targetId);
          if (found) return found;
        }
        return null;
      };

      for (const folderId of selectedIds) {
        const folderNode = findNode(tree, folderId);
        if (folderNode) {
          collectDescendantIds(folderNode).forEach(id => ids.add(id));
        }
      }
      return Array.from(ids);
    }

    // For page level, just return selected IDs
    return Array.from(selectedIds);
  }, [level, selectedIds, pages, tree]);

  const pageCount = level === 'space' ? pages.length : targetIds.length;

  function toggleSelection(id: string) {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  }

  function selectAll() {
    setSelectedIds(new Set(selectableItems.map(item => item.node.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleBackup() {
    if (level !== 'space' && selectedIds.size === 0) {
      setError('Please select at least one item to backup');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const backupResult = await api.startBackup({
        spaceId: space.id,
        spaceName: space.name,
        format,
        level,
        targetIds: level === 'space' ? undefined : targetIds,
      });

      setResult(backupResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed');
    } finally {
      setLoading(false);
    }
  }

  const formats: { value: BackupFormat; label: string }[] = [
    { value: 'html', label: 'HTML' },
    { value: 'markdown', label: 'MD' },
    { value: 'pdf', label: 'PDF' },
    { value: 'html+md', label: 'HTML+MD' },
    { value: 'all', label: 'All' },
  ];

  const levels: { value: BackupLevel; label: string }[] = [
    { value: 'space', label: 'Entire Space' },
    { value: 'folder', label: 'Folders' },
    { value: 'page', label: 'Pages' },
  ];

  return (
    <div className="card">
      <div className="card-title">Backup</div>

      {/* Backup Level */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{ fontSize: '0.75rem', marginBottom: '0.375rem', color: 'var(--color-text-secondary)' }}>
          Backup Level
        </div>
        <div className="format-selector">
          {levels.map((l) => (
            <button
              key={l.value}
              className={`format-btn ${level === l.value ? 'selected' : ''}`}
              onClick={() => {
                setLevel(l.value);
                setSelectedIds(new Set());
              }}
              disabled={loading}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Item Selection for folder/page level */}
      {level !== 'space' && selectableItems.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.375rem'
          }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
              Select {level === 'folder' ? 'Folders' : 'Pages'} ({selectedIds.size} selected)
            </span>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button
                className="btn btn-secondary"
                style={{ fontSize: '0.625rem', padding: '0.125rem 0.375rem' }}
                onClick={selectAll}
                disabled={loading}
              >
                All
              </button>
              <button
                className="btn btn-secondary"
                style={{ fontSize: '0.625rem', padding: '0.125rem 0.375rem' }}
                onClick={clearSelection}
                disabled={loading}
              >
                Clear
              </button>
            </div>
          </div>
          <div style={{
            maxHeight: '120px',
            overflowY: 'auto',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            background: 'var(--color-bg-primary)'
          }}>
            {selectableItems.map(({ node, hasChildren }) => (
              <label
                key={node.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(node.id)}
                  onChange={() => toggleSelection(node.id)}
                  disabled={loading}
                />
                <span>{hasChildren ? '📂' : '📄'}</span>
                <span style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {node.title}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Output Format */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{ fontSize: '0.75rem', marginBottom: '0.375rem', color: 'var(--color-text-secondary)' }}>
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

      {/* Backup Button */}
      <button
        className="btn btn-primary"
        style={{ width: '100%' }}
        onClick={handleBackup}
        disabled={loading || pageCount === 0}
      >
        {loading ? 'Backing up...' : `Backup ${pageCount} page${pageCount !== 1 ? 's' : ''}`}
      </button>

      {error && (
        <div className="error" style={{ marginTop: '0.75rem', fontSize: '0.75rem' }}>
          {error}
        </div>
      )}

      {result && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.75rem',
            background: 'var(--color-bg-primary)',
            borderRadius: '6px',
            fontSize: '0.75rem',
          }}
        >
          <div
            style={{
              color: result.success ? 'var(--color-success)' : 'var(--color-error)',
              fontWeight: 500,
              marginBottom: '0.375rem',
            }}
          >
            {result.success ? '✓ Backup completed!' : '✗ Backup failed'}
          </div>

          {result.outputPath && (
            <div style={{ marginBottom: '0.375rem', wordBreak: 'break-all' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>Output: </span>
              <code style={{ fontSize: '0.625rem' }}>{result.outputPath}</code>
            </div>
          )}

          {result.results && (
            <div>
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
