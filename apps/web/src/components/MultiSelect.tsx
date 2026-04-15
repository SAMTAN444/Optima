import { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface MultiSelectProps {
  label?: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
}

export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = 'Search...',
}: MultiSelectProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Only show results after the user has typed at least 1 character
  const filtered = search.length > 0
    ? options
        .filter((o) => !selected.includes(o))
        .filter((o) => o.toLowerCase().includes(search.toLowerCase()))
        .slice(0, 20)
    : [];

  const toggle = (item: string) => {
    if (selected.includes(item)) {
      onChange(selected.filter((s) => s !== item));
    } else {
      onChange([...selected, item]);
      setSearch('');
    }
  };

  const showDropdown = open && search.length > 0;

  return (
    <div className="space-y-2" ref={containerRef}>
      {label && (
        <label className="text-[13px] font-semibold text-dark block">{label}</label>
      )}

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 bg-sky-50 text-sky-600 text-[12px] px-2.5 py-1 rounded-full font-medium border border-sky-100"
            >
              {item}
              <button
                type="button"
                onClick={() => toggle(item)}
                className="text-sky-400 hover:text-sky-700 transition-colors flex-shrink-0"
              >
                <X size={10} strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Search
          size={13}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full pl-8 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-sky-300/30 focus:border-sky-300/50 transition-colors"
          autoComplete="off"
        />
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
          {filtered.length === 0 ? (
            <p className="text-[12px] text-muted px-3 py-3 text-center">No matches found</p>
          ) : (
            <div className="max-h-44 overflow-y-auto divide-y divide-gray-50">
              {filtered.map((option) => (
                <button
                  key={option}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    toggle(option);
                  }}
                  className="w-full text-left px-3 py-2.5 text-[13px] text-dark hover:bg-surface transition-colors"
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
