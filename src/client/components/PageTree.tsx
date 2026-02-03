import { useState } from 'react';
import { TreeNode, api } from '../services/api';

interface TreeNodeItemProps {
  node: TreeNode;
  selectedPageId?: string;
  onSelect: (pageId: string) => void;
  level: number;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelection: (pageId: string) => void;
}

function TreeNodeItem({
  node,
  selectedPageId,
  onSelect,
  level,
  selectionMode,
  selectedIds,
  onToggleSelection,
}: TreeNodeItemProps) {
  const [expanded, setExpanded] = useState(level < 2);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedIds.has(node.id);

  return (
    <div className="tree-node">
      <div
        className="tree-node-label"
        style={{
          background: selectedPageId === node.id ? 'var(--accent-color)' : undefined,
          color: selectedPageId === node.id ? 'white' : undefined,
        }}
        onClick={() => !selectionMode && onSelect(node.id)}
      >
        {selectionMode && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelection(node.id)}
            onClick={(e) => e.stopPropagation()}
            style={{ width: '1rem', height: '1rem', cursor: 'pointer', accentColor: 'var(--color-primary)' }}
          />
        )}
        {hasChildren && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            style={{ cursor: 'pointer', width: '1rem' }}
          >
            {expanded ? '▼' : '▶'}
          </span>
        )}
        <span>{hasChildren ? '📂' : '📄'}</span>
        <span style={{ flex: 1 }}>{node.title}</span>
      </div>
      {hasChildren && expanded && (
        <div className="tree-node-children">
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              selectedPageId={selectedPageId}
              onSelect={onSelect}
              level={level + 1}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onToggleSelection={onToggleSelection}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ConfirmDialogProps {
  isOpen: boolean;
  pageCount: number;
  includeChildren: boolean;
  onIncludeChildrenChange: (value: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  isOpen,
  pageCount,
  includeChildren,
  onIncludeChildrenChange,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        className="card"
        style={{
          minWidth: '320px',
          maxWidth: '400px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 600 }}>
          페이지 삭제 확인
        </h3>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
          <strong>{pageCount}개</strong> 페이지를 삭제하시겠습니까?
          <br />
          <span style={{ color: 'var(--color-error)' }}>이 작업은 복구할 수 없습니다.</span>
        </p>
        <label className="checkbox-item" style={{ marginBottom: '1rem' }}>
          <input
            type="checkbox"
            checked={includeChildren}
            onChange={(e) => onIncludeChildrenChange(e.target.checked)}
          />
          <span>하위 페이지 포함</span>
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onCancel}>
            취소
          </button>
          <button
            className="btn"
            style={{ backgroundColor: 'var(--color-error)', color: 'white' }}
            onClick={onConfirm}
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  tree: TreeNode[];
  selectedPageId?: string;
  onSelect: (pageId: string) => void;
  onPagesDeleted?: () => void;
}

export default function PageTree({ tree, selectedPageId, onSelect, onPagesDeleted }: Props) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [includeChildren, setIncludeChildren] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function toggleSelection(pageId: string) {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(pageId)) {
      newSelected.delete(pageId);
    } else {
      newSelected.add(pageId);
    }
    setSelectedIds(newSelected);
  }

  function handleSelectAll() {
    const allIds = new Set<string>();
    function collectIds(nodes: TreeNode[]) {
      for (const node of nodes) {
        allIds.add(node.id);
        collectIds(node.children);
      }
    }
    collectIds(tree);
    setSelectedIds(allIds);
  }

  function handleDeselectAll() {
    setSelectedIds(new Set());
  }

  function handleDeleteClick() {
    if (selectedIds.size === 0) return;
    setShowConfirmDialog(true);
  }

  async function handleConfirmDelete() {
    setShowConfirmDialog(false);
    setDeleting(true);
    setDeleteError(null);

    try {
      const result = await api.deletePages(Array.from(selectedIds), includeChildren);
      if (!result.success) {
        setDeleteError(result.message);
      }
      // Reset selection mode
      setSelectionMode(false);
      setSelectedIds(new Set());
      setIncludeChildren(false);
      // Notify parent to refresh the tree
      onPagesDeleted?.();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete pages');
    } finally {
      setDeleting(false);
    }
  }

  if (tree.length === 0) {
    return (
      <div style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>
        No pages found
      </div>
    );
  }

  return (
    <div>
      {/* Selection mode controls */}
      <div style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
        <button
          className={`btn btn-sm ${selectionMode ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => {
            setSelectionMode(!selectionMode);
            if (selectionMode) {
              setSelectedIds(new Set());
              setDeleteError(null);
            }
          }}
        >
          {selectionMode ? '선택 취소' : '선택'}
        </button>
        {selectionMode && (
          <>
            <button className="btn btn-sm btn-secondary" onClick={handleSelectAll}>
              전체 선택
            </button>
            <button className="btn btn-sm btn-secondary" onClick={handleDeselectAll}>
              선택 해제
            </button>
            <button
              className="btn btn-sm"
              style={{
                backgroundColor: selectedIds.size > 0 ? 'var(--color-error)' : undefined,
                color: selectedIds.size > 0 ? 'white' : undefined,
                opacity: selectedIds.size === 0 ? 0.5 : 1,
              }}
              onClick={handleDeleteClick}
              disabled={selectedIds.size === 0 || deleting}
            >
              {deleting ? '삭제 중...' : `삭제 (${selectedIds.size})`}
            </button>
          </>
        )}
      </div>

      {deleteError && (
        <div className="error-message" style={{ marginBottom: '0.5rem', fontSize: '0.75rem' }}>
          {deleteError}
        </div>
      )}

      {/* Tree */}
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {tree.map((node) => (
          <TreeNodeItem
            key={node.id}
            node={node}
            selectedPageId={selectedPageId}
            onSelect={onSelect}
            level={0}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            onToggleSelection={toggleSelection}
          />
        ))}
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        pageCount={selectedIds.size}
        includeChildren={includeChildren}
        onIncludeChildrenChange={setIncludeChildren}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowConfirmDialog(false)}
      />
    </div>
  );
}
