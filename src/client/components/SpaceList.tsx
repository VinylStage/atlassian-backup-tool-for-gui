/**
 * @file Space 목록 컴포넌트
 * @description Confluence Space 목록을 표시하고 선택하는 컴포넌트
 *
 * 주요 기능:
 * - Space 목록 렌더링
 * - Space 선택 (클릭)
 * - 로딩 상태 표시
 * - 빈 목록 처리
 *
 * 특징:
 * - 간단한 Presentational 컴포넌트
 * - 상태 관리 없이 props만 사용
 * - 선택된 Space 하이라이트
 */

import { Space } from '../services/api';

// ===== 타입 정의 =====

/**
 * SpaceList 컴포넌트의 Props
 *
 * @property {Space[]} spaces - Space 목록
 * @property {Space | null} selectedSpace - 현재 선택된 Space
 * @property {function} onSelect - Space 선택 핸들러
 * @property {boolean} loading - 로딩 상태
 */
interface Props {
  spaces: Space[];
  selectedSpace: Space | null;
  onSelect: (space: Space) => void;
  loading: boolean;
}

/**
 * Space 목록 컴포넌트
 *
 * @description
 * Confluence Space 목록을 표시하는 Presentational 컴포넌트
 *
 * 렌더링 조건:
 * 1. loading=true: 로딩 인디케이터 표시
 * 2. spaces 빈 배열: "No spaces found" 메시지
 * 3. 정상: 스크롤 가능한 Space 목록
 *
 * @param {Props} props - 컴포넌트 속성
 * @returns {JSX.Element} Space 목록 UI
 *
 * @example
 * <SpaceList
 *   spaces={spaces}
 *   selectedSpace={selectedSpace}
 *   onSelect={handleSelect}
 *   loading={isLoading}
 * />
 */
export default function SpaceList({ spaces, selectedSpace, onSelect, loading }: Props) {
  // ===== 로딩 상태 처리 =====
  if (loading) {
    return <div className="loading" style={{ padding: '1rem' }}>Loading...</div>;
  }

  // ===== 빈 목록 처리 =====
  if (spaces.length === 0) {
    return (
      <div style={{ padding: '0.5rem', color: 'var(--color-text-secondary)', fontSize: '0.8125rem' }}>
        No spaces found
      </div>
    );
  }

  // ===== 정상 렌더링 =====
  return (
    // 스크롤 컨테이너: 최대 높이 200px, 초과 시 스크롤
    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
      {spaces.map((space) => (
        // 개별 Space 항목
        <div
          key={space.id}
          // CSS 클래스: 기본 + 선택 상태
          className={`space-item ${selectedSpace?.id === space.id ? 'selected' : ''}`}
          onClick={() => onSelect(space)}
          title={space.name} // 마우스 오버 시 전체 이름 표시
        >
          {space.name}
        </div>
      ))}
    </div>
  );
}
