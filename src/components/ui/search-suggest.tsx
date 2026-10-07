'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

interface Suggestion {
  id: number;
  label: string;
  sub: string;
  type: string;
}

export function SearchSuggest({ placeholder = '단백질, 유전자명 검색...' }: { placeholder?: string }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(-1);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (query.length < 2) { setSuggestions([]); setOpen(false); return; }

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setSuggestions(data);
        setOpen(data.length > 0);
        setSelected(-1);
      } catch { setSuggestions([]); }
    }, 300);

    return () => clearTimeout(timerRef.current);
  }, [query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function navigate(s: Suggestion) {
    setOpen(false);
    setQuery('');
    router.push(`/proteins/${s.id}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (selected >= 0 && suggestions[selected]) navigate(suggestions[selected]);
      else if (query) { setOpen(false); router.push(`/proteins?search=${encodeURIComponent(query)}`); }
    }
    else if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full rounded-lg border bg-muted/50 pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute top-full mt-1 w-full rounded-lg border bg-popover shadow-lg z-50 overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              onClick={() => navigate(s)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between ${i === selected ? 'bg-muted' : ''}`}
            >
              <div>
                <span className="font-medium">{s.label}</span>
                {s.sub && <span className="text-xs text-muted-foreground ml-2">{s.sub}</span>}
              </div>
            </button>
          ))}
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t">
            Enter로 전체 검색 · ↑↓로 선택
          </div>
        </div>
      )}
    </div>
  );
}
