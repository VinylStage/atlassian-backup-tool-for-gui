import { useState, useEffect } from 'react';
import SpaceList from './components/SpaceList';
import PageTree from './components/PageTree';
import PageViewer from './components/PageViewer';
import BackupPanel from './components/BackupPanel';
import { api, Space, Page, TreeNode, TreeStats } from './services/api';

export default function App() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [treeStats, setTreeStats] = useState<TreeStats | null>(null);
  const [selectedPage, setSelectedPage] = useState<Page | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSpaces();
  }, []);

  async function loadSpaces() {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getSpaces();
      setSpaces(data);
    } catch (err) {
      setError('Failed to load spaces. Check your .env configuration.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectSpace(space: Space) {
    setSelectedSpace(space);
    setSelectedPage(null);
    setTree(null);
    setTreeStats(null);

    try {
      setLoading(true);
      setError(null);

      const [treeData, pagesData] = await Promise.all([
        api.getTree(space.id),
        api.getPages(space.id),
      ]);

      setTree(treeData.tree);
      setTreeStats(treeData.stats);
      setPages(pagesData);
    } catch (err) {
      setError('Failed to load space data.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectPage(pageId: string) {
    const page = pages.find((p) => p.id === pageId);
    if (page) {
      setSelectedPage(page);
    }
  }

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="card">
          <div className="card-title">Spaces</div>
          <SpaceList
            spaces={spaces}
            selectedSpace={selectedSpace}
            onSelect={handleSelectSpace}
            loading={loading && !selectedSpace}
          />
        </div>

        {selectedSpace && tree && (
          <div className="card">
            <div className="card-title">Pages</div>
            <PageTree
              tree={tree}
              selectedPageId={selectedPage?.id}
              onSelect={handleSelectPage}
            />
          </div>
        )}

        {selectedSpace && treeStats && (
          <div className="card">
            <div className="card-title">Statistics</div>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{treeStats.totalPages}</div>
                <div className="stat-label">Total Pages</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{treeStats.rootPages}</div>
                <div className="stat-label">Root Pages</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{treeStats.maxDepth}</div>
                <div className="stat-label">Max Depth</div>
              </div>
            </div>
          </div>
        )}

        {selectedSpace && (
          <BackupPanel space={selectedSpace} pages={pages} />
        )}
      </aside>

      <main className="main-content">
        <header className="header">
          <h1>Confluence Backup Tool</h1>
          {selectedSpace && (
            <span style={{ color: 'var(--text-secondary)' }}>
              {selectedSpace.name}
            </span>
          )}
        </header>

        {error && <div className="error">{error}</div>}

        {loading && !tree && (
          <div className="loading">Loading...</div>
        )}

        {selectedPage ? (
          <PageViewer page={selectedPage} />
        ) : selectedSpace ? (
          <div className="card" style={{ marginTop: '1rem' }}>
            <p style={{ color: 'var(--text-secondary)' }}>
              Select a page from the tree to preview its content.
            </p>
          </div>
        ) : (
          <div className="card" style={{ marginTop: '1rem' }}>
            <p style={{ color: 'var(--text-secondary)' }}>
              Select a space from the sidebar to get started.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
