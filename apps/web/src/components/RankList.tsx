import { Bus, BookOpen, Languages, Trophy, Sparkles, ChevronUp, ChevronDown } from 'lucide-react';
import type { RankedCriterion } from '@optima/shared';

const CRITERION_META: Record<RankedCriterion, { label: string; icon: React.ReactElement }> = {
  commute:           { label: 'Commute Time',           icon: <Bus size={13} /> },
  programmes:        { label: 'Programmes',             icon: <BookOpen size={13} /> },
  subjectsLanguages: { label: 'Subjects & Languages',  icon: <Languages size={13} /> },
  ccas:              { label: 'CCAs',                   icon: <Trophy size={13} /> },
  distinctive:       { label: 'Distinctive Programmes', icon: <Sparkles size={13} /> },
};

interface RankListProps {
  criteria: RankedCriterion[];
  onChange: (criteria: RankedCriterion[]) => void;
}

export function RankList({ criteria, onChange }: RankListProps) {
  const move = (index: number, direction: 'up' | 'down') => {
    const next = [...criteria];
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  if (criteria.length === 0) {
    return (
      <p className="text-[13px] text-muted italic text-center py-4">
        Select criteria above to rank them.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {criteria.map((criterion, i) => {
        const meta = CRITERION_META[criterion];
        return (
          <div
            key={criterion}
            className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3"
          >
            <span className="w-5 h-5 flex items-center justify-center bg-navy text-white text-[10px] font-bold rounded-full flex-shrink-0">
              {i + 1}
            </span>
            <span className="text-muted flex-shrink-0">{meta.icon}</span>
            <span className="flex-1 text-[13px] font-medium text-dark">{meta.label}</span>
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => move(i, 'up')}
                disabled={i === 0}
                className="p-1 rounded text-muted hover:text-dark hover:bg-surface disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronUp size={13} />
              </button>
              <button
                type="button"
                onClick={() => move(i, 'down')}
                disabled={i === criteria.length - 1}
                className="p-1 rounded text-muted hover:text-dark hover:bg-surface disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronDown size={13} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
