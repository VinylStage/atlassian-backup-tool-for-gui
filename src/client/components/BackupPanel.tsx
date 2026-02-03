/**
 * @file 백업 패널 컴포넌트
 * @description 다중 페이지 백업 및 다운로드를 위한 UI 패널
 *
 * 주요 기능:
 * - 백업 레벨 선택 (전체 Space / 폴더 / 개별 페이지)
 * - 출력 포맷 선택 (HTML / MD / PDF)
 * - 대상 페이지 선택 (폴더/페이지 레벨 시)
 * - ZIP 파일 다운로드
 *
 * 백업 레벨:
 * - space: 전체 Space의 모든 페이지
 * - folder: 선택한 폴더와 그 하위 페이지들
 * - page: 선택한 개별 페이지들만
 */

import { useState, useMemo } from 'react';
import { Space, Page, TreeNode, BackupLevel, api } from '../services/api';

// ===== 타입 정의 =====

/**
 * BackupPanel 컴포넌트의 Props
 */
interface Props {
  space: Space;              // 현재 선택된 Space
  pages: Page[];             // Space의 모든 페이지 배열
  tree: TreeNode[] | null;   // 트리 구조 (null이면 아직 로드 안됨)
}

// ===== 헬퍼 함수 =====

/**
 * 트리 노드의 모든 자손 ID 수집
 *
 * @param {TreeNode} node - 시작 노드
 * @returns {string[]} 노드 자신과 모든 자손의 ID 배열
 *
 * @description
 * 재귀적으로 자식 노드들을 순회하며 ID 수집
 * 폴더 백업 시 해당 폴더와 모든 하위 페이지 포함에 사용
 *
 * @example
 * const ids = collectDescendantIds(folderNode);
 * // ['folder-id', 'child1-id', 'child2-id', ...]
 */
function collectDescendantIds(node: TreeNode): string[] {
  // 현재 노드 ID로 시작
  const ids = [node.id];

  // 각 자식에 대해 재귀 호출하여 결과 병합
  for (const child of node.children) {
    ids.push(...collectDescendantIds(child));
  }

  return ids;
}

/**
 * 트리를 평면 배열로 변환
 *
 * @param {TreeNode[]} nodes - 트리 노드 배열
 * @param {string | null} parentId - 부모 ID (루트는 null)
 * @returns {Array} 평면화된 노드 배열
 *
 * @description
 * 트리 구조를 평면 배열로 변환하여 선택 목록 표시에 사용
 * 각 항목에 부모 정보와 자식 유무 포함
 *
 * @example
 * const flat = flattenTree(tree);
 * // [{ node, parentId, hasChildren }, ...]
 */
function flattenTree(nodes: TreeNode[], parentId: string | null = null): Array<{ node: TreeNode; parentId: string | null; hasChildren: boolean }> {
  const result: Array<{ node: TreeNode; parentId: string | null; hasChildren: boolean }> = [];

  for (const node of nodes) {
    // 현재 노드 추가
    result.push({ node, parentId, hasChildren: node.children.length > 0 });

    // 자식 노드들도 재귀적으로 추가
    result.push(...flattenTree(node.children, node.id));
  }

  return result;
}

/**
 * 백업 패널 컴포넌트
 *
 * @description
 * 다중 페이지 백업 기능을 제공하는 UI 패널
 *
 * 상태:
 * - formats: 출력 포맷 선택
 * - level: 백업 레벨 (space/folder/page)
 * - selectedIds: 선택된 대상 ID들
 * - loading: 다운로드 진행 중
 * - error/successMessage: 결과 메시지
 *
 * @param {Props} props - 컴포넌트 속성
 */
export default function BackupPanel({ space, pages, tree }: Props) {
  // ===== 상태 관리 =====

  /** 출력 포맷 선택 (기본: HTML + MD) */
  const [formats, setFormats] = useState({ html: true, md: true, pdf: false });

  /** 백업 레벨 선택 */
  const [level, setLevel] = useState<BackupLevel>('space');

  /** 선택된 대상 ID Set */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  /** 다운로드 진행 중 여부 */
  const [loading, setLoading] = useState(false);

  /** 에러 메시지 */
  const [error, setError] = useState<string | null>(null);

  /** 성공 메시지 */
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // ===== 파생 데이터 (useMemo) =====

  /**
   * 선택 가능한 항목 목록
   *
   * @description
   * 백업 레벨에 따라 선택 가능한 항목이 달라짐:
   * - space: 선택 불필요 (전체 백업)
   * - folder: 자식이 있는 노드(폴더)만
   * - page: 모든 노드
   *
   * useMemo로 tree/level 변경 시에만 재계산
   */
  const selectableItems = useMemo(() => {
    if (!tree) return [];
    const flattened = flattenTree(tree);

    if (level === 'folder') {
      // 폴더만 표시: 자식이 있는 노드
      return flattened.filter(item => item.hasChildren);
    } else if (level === 'page') {
      // 모든 페이지 표시
      return flattened;
    }
    return [];
  }, [tree, level]);

  /**
   * 백업 대상 페이지 ID 배열
   *
   * @description
   * 선택된 항목에 따라 실제 백업할 페이지 ID 계산:
   * - space: 전체 페이지
   * - folder: 선택된 폴더와 모든 하위 페이지
   * - page: 선택된 페이지만
   */
  const targetIds = useMemo(() => {
    if (level === 'space') {
      // 전체 Space: 모든 페이지 ID
      return pages.map(p => p.id);
    }

    if (level === 'folder' && tree) {
      // 폴더: 선택된 폴더의 모든 자손 수집
      const ids = new Set<string>();

      // 트리에서 노드 찾기 헬퍼 함수
      const findNode = (nodes: TreeNode[], targetId: string): TreeNode | null => {
        for (const node of nodes) {
          if (node.id === targetId) return node;
          const found = findNode(node.children, targetId);
          if (found) return found;
        }
        return null;
      };

      // 각 선택된 폴더에 대해 자손 수집
      for (const folderId of selectedIds) {
        const folderNode = findNode(tree, folderId);
        if (folderNode) {
          collectDescendantIds(folderNode).forEach(id => ids.add(id));
        }
      }
      return Array.from(ids);
    }

    // 페이지: 선택된 것만
    return Array.from(selectedIds);
  }, [level, selectedIds, pages, tree]);

  // 백업 대상 페이지 수
  const pageCount = level === 'space' ? pages.length : targetIds.length;

  // ===== 이벤트 핸들러 =====

  /**
   * 항목 선택 토글
   */
  function toggleSelection(id: string) {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  }

  /**
   * 전체 선택
   */
  function selectAll() {
    setSelectedIds(new Set(selectableItems.map(item => item.node.id)));
  }

  /**
   * 전체 해제
   */
  function clearSelection() {
    setSelectedIds(new Set());
  }

  /**
   * 다운로드 핸들러
   *
   * @description
   * 선택된 옵션에 따라 백업 ZIP 다운로드
   * - 포맷 미선택 시 에러
   * - folder/page 레벨인데 항목 미선택 시 에러
   */
  async function handleDownload() {
    // 포맷 선택 검사
    if (!formats.html && !formats.md && !formats.pdf) {
      setError('Select at least one format');
      return;
    }

    // 항목 선택 검사 (space 제외)
    if (level !== 'space' && selectedIds.size === 0) {
      setError('Please select at least one item to download');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccessMessage(null);

      // API 호출: 백업 ZIP 다운로드
      await api.downloadBackup(
        space.id,
        space.name,
        formats,
        level,
        level === 'space' ? undefined : targetIds
      );

      // 성공 메시지
      setSuccessMessage(`Downloaded ${pageCount} page${pageCount !== 1 ? 's' : ''} as ZIP`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setLoading(false);
    }
  }

  // ===== 레벨 옵션 정의 =====

  const levels: { value: BackupLevel; label: string }[] = [
    { value: 'space', label: 'Entire Space' },
    { value: 'folder', label: 'Folders' },
    { value: 'page', label: 'Pages' },
  ];

  // ===== 렌더링 =====

  return (
    <div className="card">
      <div className="card-title">Backup & Download</div>

      {/* ===== 백업 레벨 선택 ===== */}
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
                setSelectedIds(new Set()); // 레벨 변경 시 선택 초기화
              }}
              disabled={loading}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== 항목 선택 (folder/page 레벨) ===== */}
      {level !== 'space' && selectableItems.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          {/* 헤더: 선택 개수 + 전체/해제 버튼 */}
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

          {/* 선택 목록 */}
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

      {/* ===== 출력 포맷 선택 ===== */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{ fontSize: '0.75rem', marginBottom: '0.375rem', color: 'var(--color-text-secondary)' }}>
          Output Format
        </div>
        <div className="download-controls" style={{ borderBottom: 'none', marginBottom: 0 }}>
          <label className="format-checkbox">
            <input
              type="checkbox"
              checked={formats.html}
              onChange={(e) => setFormats({ ...formats, html: e.target.checked })}
              disabled={loading}
            />
            <span className="format-label">HTML</span>
          </label>
          <label className="format-checkbox">
            <input
              type="checkbox"
              checked={formats.md}
              onChange={(e) => setFormats({ ...formats, md: e.target.checked })}
              disabled={loading}
            />
            <span className="format-label">MD</span>
          </label>
          <label className="format-checkbox">
            <input
              type="checkbox"
              checked={formats.pdf}
              onChange={(e) => setFormats({ ...formats, pdf: e.target.checked })}
              disabled={loading}
            />
            <span className="format-label">PDF</span>
          </label>
        </div>
      </div>

      {/* ===== 다운로드 버튼 ===== */}
      <button
        className="btn btn-primary"
        style={{ width: '100%' }}
        onClick={handleDownload}
        disabled={loading || pageCount === 0 || (!formats.html && !formats.md && !formats.pdf)}
      >
        {loading ? 'Downloading...' : `Download ${pageCount} page${pageCount !== 1 ? 's' : ''}`}
      </button>

      {/* 에러 메시지 */}
      {error && (
        <div className="error" style={{ marginTop: '0.75rem', fontSize: '0.75rem' }}>
          {error}
        </div>
      )}

      {/* 성공 메시지 */}
      {successMessage && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.5rem',
            background: 'var(--color-bg-primary)',
            borderRadius: '6px',
            fontSize: '0.75rem',
            color: 'var(--color-success)',
          }}
        >
          ✓ {successMessage}
        </div>
      )}
    </div>
  );
}
