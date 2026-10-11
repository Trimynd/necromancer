import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface SectionHeaderProps {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  note?: string;
}

export function SectionHeader({ icon: Icon, eyebrow, title, note }: SectionHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="eyebrow flex items-center gap-2">
          <Icon size={13} />
          {eyebrow}
        </div>
        <h3 className="font-display mt-2 text-xl font-semibold">{title}</h3>
      </div>
      {note && (
        <span className="font-mono text-[8px] uppercase tracking-[.08em] text-[#52696d]">
          {note}
        </span>
      )}
    </div>
  );
}

interface LeverRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}

export function LeverRow({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: LeverRowProps) {
  return (
    <label
      className="mb-4 block"
      data-testid={`lever-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`}
    >
      <span className="mb-2 flex items-center justify-between gap-2 text-[9px] text-[#829795]">
        <span>{label}</span>
        <span className="font-mono text-[#c3d6cf]">{display}</span>
      </span>
      <input
        className="slider"
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
