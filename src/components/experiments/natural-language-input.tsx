'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Loader2 } from 'lucide-react';

interface NaturalLanguageInputProps {
  experimentType: string;
  placeholder: string;
  onParsed: (data: Record<string, any>) => void;
}

export function NaturalLanguageInput({ experimentType, placeholder, onParsed }: NaturalLanguageInputProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleParse() {
    if (!text.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/chat-to-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), experimentType }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to parse');
        return;
      }
      onParsed(json.data);
      setText('');
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleParse();
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-end">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="min-h-10 flex-1"
          rows={2}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={handleParse}
          disabled={loading || !text.trim()}
          className="shrink-0"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          <span className="ml-1.5">{loading ? 'Parsing...' : 'AI Parse'}</span>
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
