import { useEffect, useState, useCallback } from 'react';
import SpaceList from './components/SpaceList';
import PageTree from './components/PageTree';
import PageViewer from './components/PageViewer';
import BackupPanel from './components/BackupPanel';
import { useStore } from './store/useStore';

const SIDEBAR_MIN_WIDTH = 240;
const SIDEBAR_MAX_WIDTH = 600;
const SIDEBAR_DEFAULT_WIDTH = 320;
const SIDEBAR_STORAGE_KEY = 'sidebarWidth';

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
    refreshCurrentSpace,
  } = useStore();

  // Sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return saved ? parseInt(saved, 10) : SIDEBAR_DEFAULT_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    loadSpaces();
  }, [loadSpaces]);

  // Resize handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = Math.min(Math.max(e.clientX, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH);
      setSidebarWidth(newWidth);
    },
    [isResizing]
  );

  const handleMouseUp = useCallback(() => {
    if (isResizing) {
      setIsResizing(false);
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth));
    }
  }, [isResizing, sidebarWidth]);

  // Add/remove global event listeners for resize
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const tree = getCurrentTree();
  const stats = getCurrentStats();
  const pages = getCurrentPages();
  const selectedPage = getSelectedPage();

  return (
    <div className="app-container">
      <aside className="sidebar" style={{ width: sidebarWidth }}>
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
              onPagesDeleted={refreshCurrentSpace}
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

      {/* Resize handle */}
      <div
        className="resize-handle"
        onMouseDown={handleMouseDown}
      />

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
