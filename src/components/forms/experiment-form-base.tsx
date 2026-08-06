'use client';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from './form-field';
import { EnumSelect } from './enum-select';

const SOURCE_TYPES = ['experimental', 'literature', 'database'] as const;

interface ExperimentFormBaseProps {
  values: {
    source_type: string;
    performed_by: string;
    performed_on: string;
    notes: string;
  };
  onChange: (field: string, value: string) => void;
  errors?: Record<string, string>;
}

export function ExperimentFormBase({ values, onChange, errors }: ExperimentFormBaseProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <FormField label="Source Type" name="source_type" required error={errors?.source_type}>
        <EnumSelect
          options={SOURCE_TYPES}
          value={values.source_type}
          onChange={(v) => onChange('source_type', v)}
          name="source_type"
        />
      </FormField>

      <FormField label="Performed By" name="performed_by" error={errors?.performed_by}>
        <Input
          id="performed_by"
          value={values.performed_by}
          onChange={(e) => onChange('performed_by', e.target.value)}
        />
      </FormField>

      <FormField label="Performed On" name="performed_on" error={errors?.performed_on}>
        <Input
          id="performed_on"
          type="date"
          value={values.performed_on}
          onChange={(e) => onChange('performed_on', e.target.value)}
        />
      </FormField>

      <FormField label="Notes" name="notes" className="md:col-span-2" error={errors?.notes}>
        <Textarea
          id="notes"
          value={values.notes}
          onChange={(e) => onChange('notes', e.target.value)}
          rows={3}
        />
      </FormField>
    </div>
  );
}
