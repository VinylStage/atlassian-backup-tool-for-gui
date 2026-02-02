import { Space } from '../services/api';

interface Props {
  spaces: Space[];
  selectedSpace: Space | null;
  onSelect: (space: Space) => void;
  loading: boolean;
}

export default function SpaceList({ spaces, selectedSpace, onSelect, loading }: Props) {
  if (loading) {
    return <div className="loading" style={{ padding: '1rem' }}>Loading...</div>;
  }

  if (spaces.length === 0) {
    return (
      <div style={{ padding: '0.5rem', color: 'var(--color-text-secondary)', fontSize: '0.8125rem' }}>
        No spaces found
      </div>
    );
  }

  return (
    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
      {spaces.map((space) => (
        <div
          key={space.id}
          className={`space-item ${selectedSpace?.id === space.id ? 'selected' : ''}`}
          onClick={() => onSelect(space)}
          title={space.name}
        >
          {space.name}
        </div>
      ))}
    </div>
  );
}
