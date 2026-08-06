'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface EnumSelectProps {
  options: readonly string[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  name?: string;
}

export function EnumSelect({
  options,
  value,
  onChange,
  placeholder = '선택...',
  disabled,
  name,
}: EnumSelectProps) {
  return (
    <Select value={value} onValueChange={(v) => { if (v !== null) onChange(v); }} disabled={disabled} name={name}>
      <SelectTrigger data-testid="enum-select-trigger">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt, idx) => (
          <SelectItem key={opt} value={opt} data-testid={`enum-option-${opt}`}>
            {idx + 1}. {opt.replace(/_/g, ' ')}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
