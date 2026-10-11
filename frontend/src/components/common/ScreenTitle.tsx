import React from 'react';

interface ScreenTitleProps {
  index: string;
  title: string;
  subtitle: string;
  color: string;
}

export function ScreenTitle({ index, title, subtitle, color }: ScreenTitleProps) {
  return (
    <div className="border-b border-[#1c2b34] pb-4 mb-6">
      <div className="eyebrow flex items-center gap-2" style={{ color }}>
        <span className="font-mono">{index} / 05</span>
        <span className="h-px w-6 bg-current opacity-50" />
        {title}
      </div>
      <h1 className="font-display mt-2 text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-[#e6f4f1]">
        {title}
      </h1>
      <p className="mt-1 text-xs sm:text-sm text-[#82979a]">{subtitle}</p>
    </div>
  );
}
