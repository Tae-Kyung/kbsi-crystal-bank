'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/forms/form-field';
import { EnumSelect } from '@/components/forms/enum-select';
import { Upload } from 'lucide-react';

const TARGET_TABLES = ['kbsi_expression', 'kbsi_purification', 'kbsi_crystallization'] as const;

export function ExtractionForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [form, setForm] = useState({ text: '', doi: '', target_table: 'kbsi_expression' });

  const set = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.set('text', form.text);
      if (form.doi) formData.set('doi', form.doi);
      formData.set('target_table', form.target_table);

      const res = await fetch('/api/extract', { method: 'POST', body: formData });
      const json = await res.json();

      if (!res.ok) {
        setResult(`Error: ${json.error}`);
        return;
      }

      setResult(`${json.message} (Reference ID: ${json.reference_id ?? 'N/A'})`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button><Upload className="h-4 w-4 mr-2" />Extract from Paper</Button>} />
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>LLM Paper Extraction</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="DOI (optional)" name="doi">
            <Input value={form.doi} onChange={(e) => set('doi', e.target.value)} placeholder="10.1038/s41586-..." />
          </FormField>

          <FormField label="Target Table" name="target_table">
            <EnumSelect options={TARGET_TABLES} value={form.target_table} onChange={(v) => set('target_table', v)} />
          </FormField>

          <FormField label="Paper Text" name="text" required>
            <Textarea
              value={form.text}
              onChange={(e) => set('text', e.target.value)}
              rows={10}
              placeholder="Paste the methods section or relevant text from the paper..."
            />
          </FormField>

          {result && (
            <p className={`text-sm p-2 rounded-md ${result.startsWith('Error') ? 'bg-destructive/10 text-destructive' : 'bg-green-50 text-green-800'}`}>
              {result}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Close</Button>
            <Button type="submit" disabled={loading || !form.text}>
              {loading ? 'Extracting...' : 'Extract'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
