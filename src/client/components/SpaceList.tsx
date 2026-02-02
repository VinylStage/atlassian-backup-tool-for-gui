import { Space } from '../services/api';

interface Props {
  spaces: Space[];
  selectedSpace: Space | null;
  onSelect: (space: Space) => void;
  loading: boolean;
}

export default function SpaceList({ spaces, selectedSpace, onSelect, loading }: Props) {
  if (loading) {
    return <div className="loading">Loading spaces...</div>;
  }

  if (spaces.length === 0) {
    return (
      <div style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>
        No spaces found
      </div>
    );
  }

  return (
    <div>
      {spaces.map((space) => (
        <div
          key={space.id}
          className={`space-item ${selectedSpace?.id === space.id ? 'selected' : ''}`}
          onClick={() => onSelect(space)}
        >
          <div style={{ fontWeight: 500 }}>{space.name}</div>
          <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>{space.key}</div>
        </div>
      ))}
    </div>
  );
}
