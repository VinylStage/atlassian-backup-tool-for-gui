import { create } from 'zustand';
import { Space, Page, TreeNode, TreeStats, api } from '../services/api';

interface CachedTreeData {
  tree: TreeNode[];
  stats: TreeStats;
}

interface AppState {
  // Spaces
  spaces: Space[];
  spacesLoaded: boolean;
  spacesLoading: boolean;

  // Selected state
  selectedSpace: Space | null;
  selectedPageId: string | null;

  // Cached data
  pagesCache: Map<string, Page[]>;
  treeCache: Map<string, CachedTreeData>;

  // Loading states
  spaceDataLoading: boolean;
  error: string | null;

  // Actions
  loadSpaces: () => Promise<void>;
  selectSpace: (space: Space) => Promise<void>;
  selectPage: (pageId: string | null) => void;

  // Getters
  getSelectedPage: () => Page | null;
  getCurrentPages: () => Page[];
  getCurrentTree: () => TreeNode[] | null;
  getCurrentStats: () => TreeStats | null;

  // Cache management
  clearCache: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  // Initial state
  spaces: [],
  spacesLoaded: false,
  spacesLoading: false,
  selectedSpace: null,
  selectedPageId: null,
  pagesCache: new Map(),
  treeCache: new Map(),
  spaceDataLoading: false,
  error: null,

  // Load all spaces (only once)
  loadSpaces: async () => {
    const { spacesLoaded, spacesLoading } = get();
    if (spacesLoaded || spacesLoading) return;

    set({ spacesLoading: true, error: null });
    try {
      const spaces = await api.getSpaces();
      set({ spaces, spacesLoaded: true, spacesLoading: false });
    } catch (err) {
      set({
        error: 'Failed to load spaces. Check your .env configuration.',
        spacesLoading: false,
      });
    }
  },

  // Select a space and load its data (with caching)
  selectSpace: async (space: Space) => {
    const { pagesCache, treeCache } = get();

    set({
      selectedSpace: space,
      selectedPageId: null,
      error: null,
    });

    // Check if data is already cached
    const cachedPages = pagesCache.get(space.id);
    const cachedTree = treeCache.get(space.id);

    if (cachedPages && cachedTree) {
      // Data already cached, no need to fetch
      return;
    }

    // Fetch data
    set({ spaceDataLoading: true });
    try {
      const [treeData, pages] = await Promise.all([
        api.getTree(space.id),
        api.getPages(space.id),
      ]);

      // Update cache
      const newPagesCache = new Map(get().pagesCache);
      const newTreeCache = new Map(get().treeCache);
      newPagesCache.set(space.id, pages);
      newTreeCache.set(space.id, { tree: treeData.tree, stats: treeData.stats });

      set({
        pagesCache: newPagesCache,
        treeCache: newTreeCache,
        spaceDataLoading: false,
      });
    } catch (err) {
      set({
        error: 'Failed to load space data.',
        spaceDataLoading: false,
      });
    }
  },

  // Select a page
  selectPage: (pageId: string | null) => {
    set({ selectedPageId: pageId });
  },

  // Get the currently selected page
  getSelectedPage: () => {
    const { selectedSpace, selectedPageId, pagesCache } = get();
    if (!selectedSpace || !selectedPageId) return null;

    const pages = pagesCache.get(selectedSpace.id);
    if (!pages) return null;

    return pages.find((p) => p.id === selectedPageId) || null;
  },

  // Get pages for current space
  getCurrentPages: () => {
    const { selectedSpace, pagesCache } = get();
    if (!selectedSpace) return [];
    return pagesCache.get(selectedSpace.id) || [];
  },

  // Get tree for current space
  getCurrentTree: () => {
    const { selectedSpace, treeCache } = get();
    if (!selectedSpace) return null;
    return treeCache.get(selectedSpace.id)?.tree || null;
  },

  // Get stats for current space
  getCurrentStats: () => {
    const { selectedSpace, treeCache } = get();
    if (!selectedSpace) return null;
    return treeCache.get(selectedSpace.id)?.stats || null;
  },

  // Clear all caches
  clearCache: () => {
    set({
      pagesCache: new Map(),
      treeCache: new Map(),
    });
  },
}));
