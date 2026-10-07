'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import Link from 'next/link';

interface Suggestion {
  id: number;
  label: string;
  sub: string;
}

export function ProteinSearchForm({ defaultSearch, defaultOrganism }: { defaultSearch: string; defaultOrganism: string }) {
  const [search, setSearch] = useState(defaultSearch);
  const [organism, setOrganism] = useState(defaultOrganism);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(-1);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout>(undefined);

  useEffect(() => {
    if (search.length < 2) { setSuggestions([]); setOpen(false); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(search)}`);
        const data = await res.json();
        setSuggestions(data);
        setOpen(data.length > 0);
        setSelected(-1);
      } catch { setSuggestions([]); }
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [search]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOpen(false);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (organism) params.set('organism', organism);
    router.push(`/proteins?${params.toString()}`);
  }

  function navigateTo(s: Suggestion) {
    setOpen(false);
    setSearch('');
    router.push(`/proteins/${s.id}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter' && selected >= 0 && suggestions[selected]) { e.preventDefault(); navigateTo(suggestions[selected]); }
    else if (e.key === 'Escape') setOpen(false);
  }

  return (
    <form className="flex flex-wrap gap-2" onSubmit={handleSubmit}>
      <div ref={ref} className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="이름, 유전자명, 약어 검색..."
          className="w-full rounded-lg border bg-muted/50 pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {open && suggestions.length > 0 && (
          <div className="absolute top-full mt-1 w-full rounded-lg border bg-popover shadow-lg z-50 overflow-hidden">
            {suggestions.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => navigateTo(s)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 ${i === selected ? 'bg-muted' : ''}`}
              >
                <span className="font-medium">{s.label}</span>
                {s.sub && <span className="text-xs text-muted-foreground ml-2">{s.sub}</span>}
              </button>
            ))}
            <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t">
              ↑↓ 선택 · Enter 전체검색
            </div>
          </div>
        )}
      </div>
      <input
        value={organism}
        onChange={e => setOrganism(e.target.value)}
        placeholder="생물종 (예: Homo sapiens)"
        className="w-48 rounded-lg border bg-muted/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <Button type="submit" variant="outline" size="sm">검색</Button>
      {(search || organism) && (
        <Link href="/proteins"><Button type="button" variant="ghost" size="sm">초기화</Button></Link>
      )}
    </form>
  );
}
