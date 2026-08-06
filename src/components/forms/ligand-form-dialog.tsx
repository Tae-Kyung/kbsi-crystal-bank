'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from './form-field';
import { Plus } from 'lucide-react';

export function LigandFormDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', smiles: '', inchi: '', mw: '', source: '' });

  const set = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch('/api/ligands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          smiles: form.smiles || null,
          inchi: form.inchi || null,
          mw: form.mw ? parseFloat(form.mw) : null,
          source: form.source || null,
        }),
      });
      setOpen(false);
      setForm({ name: '', smiles: '', inchi: '', mw: '', source: '' });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button><Plus className="h-4 w-4 mr-2" />Add Ligand</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Ligand</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Name" name="name" required>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Sotorasib" />
          </FormField>
          <FormField label="SMILES" name="smiles">
            <Input value={form.smiles} onChange={(e) => set('smiles', e.target.value)} className="font-mono text-sm" />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="MW (Da)" name="mw">
              <Input type="number" step="0.1" value={form.mw} onChange={(e) => set('mw', e.target.value)} />
            </FormField>
            <FormField label="Source" name="source">
              <Input value={form.source} onChange={(e) => set('source', e.target.value)} placeholder="ChEMBL, PubChem..." />
            </FormField>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading || !form.name}>{loading ? 'Saving...' : 'Create'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
