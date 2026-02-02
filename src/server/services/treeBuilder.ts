import type { Page } from '../types/confluence.js';

export interface TreeNode {
  id: string;
  title: string;
  parentId: string | null;
  parentType: string;
  status: string;
  createdAt: string;
  children: TreeNode[];
}

export interface Tree {
  spaceId: string;
  spaceName: string;
  totalPages: number;
  children: TreeNode[];
}

export interface TreeStats {
  totalPages: number;
  rootPages: number;
  maxDepth: number;
  pagesByLevel: Record<number, number>;
}

export function buildTree(pages: Page[], spaceId: string, spaceName: string): Tree {
  // Page ID -> node mapping
  const pageMap = new Map<string, TreeNode>();

  for (const page of pages) {
    if (page.id) {
      pageMap.set(page.id, {
        id: page.id,
        title: page.title || '',
        parentId: page.parentId,
        parentType: page.parentType || '',
        status: page.status || '',
        createdAt: page.createdAt || '',
        children: [],
      });
    }
  }

  // Find root nodes (parentType is "space" or parentId is null)
  const rootNodes: TreeNode[] = [];

  for (const [pageId, node] of pageMap) {
    const parentId = node.parentId;
    const parentType = node.parentType;

    if (parentType === 'space' || parentId === null) {
      // Root node
      rootNodes.push(node);
    } else if (parentId && pageMap.has(parentId)) {
      // Add as child to parent
      pageMap.get(parentId)!.children.push(node);
    } else {
      // No parent found, treat as root
      rootNodes.push(node);
    }
  }

  // Sort by title
  function sortChildren(node: TreeNode): void {
    node.children.sort((a, b) => a.title.localeCompare(b.title));
    for (const child of node.children) {
      sortChildren(child);
    }
  }

  rootNodes.sort((a, b) => a.title.localeCompare(b.title));
  for (const node of rootNodes) {
    sortChildren(node);
  }

  return {
    spaceId,
    spaceName,
    totalPages: pages.length,
    children: rootNodes,
  };
}

export function getTreeStats(tree: Tree): TreeStats {
  function countDepth(node: TreeNode, currentDepth: number = 0): number {
    if (node.children.length === 0) {
      return currentDepth;
    }
    return Math.max(...node.children.map((child) => countDepth(child, currentDepth + 1)));
  }

  function countNodesByLevel(
    node: TreeNode,
    level: number,
    counts: Record<number, number>
  ): void {
    counts[level] = (counts[level] || 0) + 1;
    for (const child of node.children) {
      countNodesByLevel(child, level + 1, counts);
    }
  }

  let maxDepth = 0;
  const levelCounts: Record<number, number> = {};

  for (const child of tree.children) {
    const depth = countDepth(child, 1);
    if (depth > maxDepth) {
      maxDepth = depth;
    }
    countNodesByLevel(child, 1, levelCounts);
  }

  const rootPages = tree.children.length;

  return {
    totalPages: tree.totalPages,
    rootPages,
    maxDepth,
    pagesByLevel: levelCounts,
  };
}

// Simplified tree for client (without extra metadata)
export interface ClientTreeNode {
  id: string;
  title: string;
  children: ClientTreeNode[];
}

export function toClientTree(tree: Tree): ClientTreeNode[] {
  function toClientNode(node: TreeNode): ClientTreeNode {
    return {
      id: node.id,
      title: node.title,
      children: node.children.map(toClientNode),
    };
  }

  return tree.children.map(toClientNode);
}
