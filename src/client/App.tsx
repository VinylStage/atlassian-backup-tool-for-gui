import { useEffect } from 'react';
import SpaceList from './components/SpaceList';
import PageTree from './components/PageTree';
import PageViewer from './components/PageViewer';
import BackupPanel from './components/BackupPanel';
import { useStore } from './store/useStore';

export default function App() {
  const {
    spaces,
    spacesLoading,
    selectedSpace,
    selectedPageId,
    spaceDataLoading,
    error,
    loadSpaces,
    selectSpace,
    selectPage,
    getSelectedPage,
    getCurrentTree,
    getCurrentStats,
    getCurrentPages,
  } = useStore();

  useEffect(() => {
    loadSpaces();
  }, [loadSpaces]);

  const tree = getCurrentTree();
  const stats = getCurrentStats();
  const pages = getCurrentPages();
  const selectedPage = getSelectedPage();

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="card">
          <div className="card-title">Spaces</div>
          <SpaceList
            spaces={spaces}
            selectedSpace={selectedSpace}
            onSelect={selectSpace}
            loading={spacesLoading}
          />
        </div>

        {selectedSpace && tree && (
          <div className="card">
            <div className="card-title">Pages</div>
            <PageTree
              tree={tree}
              selectedPageId={selectedPageId}
              onSelect={selectPage}
            />
          </div>
        )}

        {selectedSpace && stats && (
          <div className="card">
            <div className="card-title">Stats</div>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{stats.totalPages}</div>
                <div className="stat-label">Pages</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{stats.rootPages}</div>
                <div className="stat-label">Root</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{stats.maxDepth}</div>
                <div className="stat-label">Depth</div>
              </div>
            </div>
          </div>
        )}

        {selectedSpace && (
          <BackupPanel
            space={selectedSpace}
            pages={pages}
            tree={tree}
          />
        )}
      </aside>

      <main className="main-content">
        <header className="header">
          <h1>Confluence Backup Tool</h1>
          {selectedSpace && (
            <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
              {selectedSpace.name}
            </span>
          )}
        </header>

        {error && <div className="error">{error}</div>}

        {(spacesLoading || spaceDataLoading) && !tree && (
          <div className="loading">Loading...</div>
        )}

        {selectedPage ? (
          <PageViewer page={selectedPage} />
        ) : selectedSpace ? (
          <div className="card" style={{ marginTop: '1rem' }}>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
              Select a page from the tree to preview its content.
            </p>
          </div>
        ) : (
          <div className="card" style={{ marginTop: '1rem' }}>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
              Select a space from the sidebar to get started.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
