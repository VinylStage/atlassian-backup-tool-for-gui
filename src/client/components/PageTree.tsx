/**
 * @file 페이지 트리 컴포넌트
 * @description Confluence 페이지를 계층 구조로 표시하고 선택/삭제 기능 제공
 *
 * 주요 기능:
 * - 트리 형태의 페이지 목록 표시
 * - 페이지 선택 (클릭)
 * - 다중 선택 모드 (체크박스)
 * - 일괄 삭제 기능
 * - 확인 다이얼로그
 *
 * 컴포넌트 구조:
 * - PageTree: 메인 컨테이너
 *   - TreeNodeItem: 개별 노드 (재귀)
 *   - ConfirmDialog: 삭제 확인 모달
 */

import { useState } from 'react';
import { TreeNode, api } from '../services/api';
import { useStore } from '../store/useStore';

// ===== 타입 정의 =====

/**
 * TreeNodeItem 컴포넌트의 Props
 */
interface TreeNodeItemProps {
  node: TreeNode;                              // 현재 노드 데이터
  selectedPageId?: string;                     // 현재 선택된 페이지 ID (하이라이트용)
  onSelect: (pageId: string) => void;          // 페이지 선택 핸들러
  level: number;                               // 트리 깊이 (0부터 시작)
  selectionMode: boolean;                      // 선택 모드 활성화 여부
  selectedIds: Set<string>;                    // 선택된 페이지 ID Set
  onToggleSelection: (pageId: string) => void; // 선택 토글 핸들러
}

/**
 * 트리 노드 아이템 컴포넌트
 *
 * @description
 * 개별 페이지를 트리 구조로 렌더링하는 재귀 컴포넌트
 *
 * 동작:
 * - 자식이 있으면 폴더 아이콘과 확장/축소 버튼 표시
 * - 클릭 시 페이지 선택 (선택 모드가 아닐 때)
 * - 선택 모드일 때는 체크박스로 다중 선택
 *
 * @param {TreeNodeItemProps} props - 컴포넌트 속성
 */
function TreeNodeItem({
  node,
  selectedPageId,
  onSelect,
  level,
  selectionMode,
  selectedIds,
  onToggleSelection,
}: TreeNodeItemProps) {
  // 확장/축소 상태
  // level < 2: 처음 2레벨은 기본으로 확장됨
  const [expanded, setExpanded] = useState(level < 2);

  // 자식 노드 존재 여부
  const hasChildren = node.children.length > 0;

  // 현재 노드 선택 여부
  const isSelected = selectedIds.has(node.id);

  return (
    <div className="tree-node">
      {/* 노드 레이블 행 */}
      <div
        className="tree-node-label"
        style={{
          // 현재 보고 있는 페이지면 하이라이트
          background: selectedPageId === node.id ? 'var(--accent-color)' : undefined,
          color: selectedPageId === node.id ? 'white' : undefined,
        }}
        // 선택 모드가 아닐 때만 클릭으로 페이지 선택
        onClick={() => !selectionMode && onSelect(node.id)}
      >
        {/* 선택 모드: 체크박스 표시 */}
        {selectionMode && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelection(node.id)}
            onClick={(e) => e.stopPropagation()} // 버블링 방지
            style={{ width: '1rem', height: '1rem', cursor: 'pointer', accentColor: 'var(--color-primary)' }}
          />
        )}

        {/* 자식이 있으면 확장/축소 토글 버튼 */}
        {hasChildren && (
          <span
            onClick={(e) => {
              e.stopPropagation(); // 페이지 선택 방지
              setExpanded(!expanded);
            }}
            style={{ cursor: 'pointer', width: '1rem' }}
          >
            {expanded ? '▼' : '▶'}
          </span>
        )}

        {/* 아이콘: 폴더 또는 문서 */}
        <span>{hasChildren ? '📂' : '📄'}</span>

        {/* 페이지 제목 */}
        <span style={{ flex: 1 }}>{node.title}</span>
      </div>

      {/* 자식 노드들 (확장 시에만 표시) */}
      {hasChildren && expanded && (
        <div className="tree-node-children">
          {node.children.map((child) => (
            // 재귀 호출: 각 자식 노드에 대해 TreeNodeItem 렌더링
            <TreeNodeItem
              key={child.id}
              node={child}
              selectedPageId={selectedPageId}
              onSelect={onSelect}
              level={level + 1}  // 깊이 증가
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

// ===== 확인 다이얼로그 컴포넌트 =====

/**
 * ConfirmDialog 컴포넌트의 Props
 */
interface ConfirmDialogProps {
  isOpen: boolean;                                // 다이얼로그 표시 여부
  pageCount: number;                              // 삭제 대상 페이지 수
  includeChildren: boolean;                       // 하위 페이지 포함 여부
  onIncludeChildrenChange: (value: boolean) => void; // 포함 여부 변경 핸들러
  onConfirm: () => void;                          // 확인 버튼 핸들러
  onCancel: () => void;                           // 취소 버튼 핸들러
}

/**
 * 삭제 확인 다이얼로그 컴포넌트
 *
 * @description
 * 페이지 삭제 전 사용자 확인을 받는 모달 다이얼로그
 *
 * 기능:
 * - 삭제할 페이지 수 표시
 * - 하위 페이지 포함 옵션
 * - 취소/삭제 버튼
 *
 * @param {ConfirmDialogProps} props - 컴포넌트 속성
 */
function ConfirmDialog({
  isOpen,
  pageCount,
  includeChildren,
  onIncludeChildrenChange,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // 열려있지 않으면 렌더링하지 않음
  if (!isOpen) return null;

  return (
    // 오버레이 (배경 딤 처리)
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)', // 반투명 검정 배경
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000, // 최상위에 표시
      }}
      onClick={onCancel} // 배경 클릭 시 취소
    >
      {/* 다이얼로그 카드 */}
      <div
        className="card"
        style={{
          minWidth: '320px',
          maxWidth: '400px',
        }}
        onClick={(e) => e.stopPropagation()} // 카드 클릭은 버블링 방지
      >
        {/* 제목 */}
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 600 }}>
          페이지 삭제 확인
        </h3>

        {/* 경고 메시지 */}
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
          <strong>{pageCount}개</strong> 페이지를 삭제하시겠습니까?
          <br />
          <span style={{ color: 'var(--color-error)' }}>이 작업은 복구할 수 없습니다.</span>
        </p>

        {/* 하위 페이지 포함 체크박스 */}
        <label className="checkbox-item" style={{ marginBottom: '1rem' }}>
          <input
            type="checkbox"
            checked={includeChildren}
            onChange={(e) => onIncludeChildrenChange(e.target.checked)}
          />
          <span>하위 페이지 포함</span>
        </label>

        {/* 버튼 영역 */}
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

// ===== 메인 PageTree 컴포넌트 =====

/**
 * PageTree 컴포넌트의 Props
 */
interface Props {
  tree: TreeNode[];                   // 트리 데이터
  selectedPageId?: string;            // 현재 선택된 페이지 ID
  onSelect: (pageId: string) => void; // 페이지 선택 핸들러
  onPagesDeleted?: () => void;        // 삭제 완료 후 콜백 (새로고침용)
}

/**
 * 페이지 트리 메인 컴포넌트
 *
 * @description
 * 페이지 목록을 트리 형태로 표시하고 선택/삭제 기능 제공
 *
 * 상태 관리:
 * - selectionMode: 다중 선택 모드 활성화 여부
 * - selectedIds: 선택된 페이지 ID Set
 * - showConfirmDialog: 삭제 확인 다이얼로그 표시 여부
 * - includeChildren: 하위 페이지 포함 옵션
 * - deleting: 삭제 진행 중 여부
 * - deleteError: 삭제 에러 메시지
 *
 * @param {Props} props - 컴포넌트 속성
 */
export default function PageTree({ tree, selectedPageId, onSelect, onPagesDeleted }: Props) {
  // Zustand에서 현재 선택된 Space 가져오기 (캐시 무효화에 필요)
  const selectedSpace = useStore((state) => state.selectedSpace);

  // ===== 상태 관리 =====
  const [selectionMode, setSelectionMode] = useState(false);           // 선택 모드
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set()); // 선택된 ID들
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);   // 다이얼로그 표시
  const [includeChildren, setIncludeChildren] = useState(false);       // 하위 포함
  const [deleting, setDeleting] = useState(false);                     // 삭제 중
  const [deleteError, setDeleteError] = useState<string | null>(null); // 에러 메시지

  // ===== 이벤트 핸들러 =====

  /**
   * 개별 페이지 선택 토글
   *
   * @param {string} pageId - 토글할 페이지 ID
   *
   * @description
   * Set의 불변성을 유지하면서 선택 상태 토글
   * React 상태 업데이트를 위해 새 Set 생성
   */
  function toggleSelection(pageId: string) {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(pageId)) {
      newSelected.delete(pageId); // 이미 선택됨 → 해제
    } else {
      newSelected.add(pageId);    // 선택 안됨 → 추가
    }
    setSelectedIds(newSelected);
  }

  /**
   * 전체 선택
   *
   * @description
   * 트리의 모든 노드를 재귀적으로 순회하며 ID 수집
   */
  function handleSelectAll() {
    const allIds = new Set<string>();

    // 재귀 함수로 모든 ID 수집
    function collectIds(nodes: TreeNode[]) {
      for (const node of nodes) {
        allIds.add(node.id);
        collectIds(node.children); // 자식들도 수집
      }
    }

    collectIds(tree);
    setSelectedIds(allIds);
  }

  /**
   * 전체 선택 해제
   */
  function handleDeselectAll() {
    setSelectedIds(new Set());
  }

  /**
   * 삭제 버튼 클릭 핸들러
   *
   * @description
   * 선택된 항목이 있을 때만 확인 다이얼로그 표시
   */
  function handleDeleteClick() {
    if (selectedIds.size === 0) return;
    setShowConfirmDialog(true);
  }

  /**
   * 삭제 확인 핸들러
   *
   * @description
   * 1. 다이얼로그 닫기
   * 2. API 호출로 삭제 요청
   * 3. 성공 시 선택 모드 초기화
   * 4. 부모에게 새로고침 알림
   */
  async function handleConfirmDelete() {
    setShowConfirmDialog(false);
    setDeleting(true);
    setDeleteError(null);

    try {
      // API 호출: 선택된 페이지들 삭제
      const result = await api.deletePages(
        Array.from(selectedIds),  // Set → Array 변환
        includeChildren,
        selectedSpace?.id         // 캐시 무효화용 Space ID
      );

      if (!result.success) {
        setDeleteError(result.message);
      }

      // 상태 초기화
      setSelectionMode(false);
      setSelectedIds(new Set());
      setIncludeChildren(false);

      // 부모에게 새로고침 요청
      onPagesDeleted?.();
    } catch (err) {
      // 에러 처리
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete pages');
    } finally {
      setDeleting(false);
    }
  }

  // ===== 렌더링 =====

  // 빈 트리 처리
  if (tree.length === 0) {
    return (
      <div style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>
        No pages found
      </div>
    );
  }

  return (
    <div>
      {/* ===== 선택 모드 컨트롤 ===== */}
      <div style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
        {/* 선택 모드 토글 버튼 */}
        <button
          className={`btn btn-sm ${selectionMode ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => {
            setSelectionMode(!selectionMode);
            if (selectionMode) {
              // 선택 모드 종료 시 초기화
              setSelectedIds(new Set());
              setDeleteError(null);
            }
          }}
        >
          {selectionMode ? '선택 취소' : '선택'}
        </button>

        {/* 선택 모드일 때만 추가 버튼들 표시 */}
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
                // 선택된 항목이 있을 때만 빨간색
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

      {/* 에러 메시지 */}
      {deleteError && (
        <div className="error-message" style={{ marginBottom: '0.5rem', fontSize: '0.75rem' }}>
          {deleteError}
        </div>
      )}

      {/* ===== 트리 본체 ===== */}
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {tree.map((node) => (
          <TreeNodeItem
            key={node.id}
            node={node}
            selectedPageId={selectedPageId}
            onSelect={onSelect}
            level={0}  // 루트 레벨
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            onToggleSelection={toggleSelection}
          />
        ))}
      </div>

      {/* ===== 삭제 확인 다이얼로그 ===== */}
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
