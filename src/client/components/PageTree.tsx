import { useState } from 'react';
import { TreeNode } from '../services/api';

interface TreeNodeItemProps {
  node: TreeNode;
  selectedPageId?: string;
  onSelect: (pageId: string) => void;
  level: number;
}

function TreeNodeItem({ node, selectedPageId, onSelect, level }: TreeNodeItemProps) {
  const [expanded, setExpanded] = useState(level < 2);
  const hasChildren = node.children.length > 0;

  return (
    <div className="tree-node">
      <div
        className="tree-node-label"
        style={{
          background: selectedPageId === node.id ? 'var(--accent-color)' : undefined,
          color: selectedPageId === node.id ? 'white' : undefined,
        }}
        onClick={() => onSelect(node.id)}
      >
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  tree: TreeNode[];
  selectedPageId?: string;
  onSelect: (pageId: string) => void;
}

export default function PageTree({ tree, selectedPageId, onSelect }: Props) {
  if (tree.length === 0) {
    return (
      <div style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>
        No pages found
      </div>
    );
  }

  return (
    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
      {tree.map((node) => (
        <TreeNodeItem
          key={node.id}
          node={node}
          selectedPageId={selectedPageId}
          onSelect={onSelect}
          level={0}
        />
      ))}
    </div>
  );
}
