import React from 'react';
import { Skull, AudioLines, ArrowLeft, RotateCcw } from 'lucide-react';
import type { Screen } from '../../types/necromancer';

interface HeaderProps {
  screen: Screen;
  sound: boolean;
  onReset: () => void;
  onSetScreen: (screen: Screen) => void;
  onToggleAmbient: () => void;
}

export function Header({
  screen,
  sound,
  onReset,
  onSetScreen,
  onToggleAmbient,
}: HeaderProps) {
  return (
    <header className="relative z-20 mx-auto flex max-w-[1440px] items-center justify-between border-b border-[#1c2b34] px-4 py-3 sm:px-8 md:px-10">
      <button
        data-testid="button-restart"
        onClick={onReset}
        className="flex items-center gap-2.5 text-left group"
      >
        <span className="flex h-8 w-8 items-center justify-center border border-[#23564f] bg-[#0d201e] text-[#29c9a9] transition group-hover:border-[#14b8a6] group-hover:shadow-[0_0_12px_rgba(20,184,166,0.3)]">
          <Skull size={18} strokeWidth={1.7} />
        </span>
        <span>
          <span className="font-display block text-[13px] font-extrabold tracking-[.08em] text-[#e6f4f1]">
            PROJECT NECROMANCER
          </span>
          <span className="font-mono block text-[8px] tracking-[.14em] text-[#78929e]">
            FROM IDEA TO AFTERLIFE
          </span>
        </span>
      </button>

      <div className="flex items-center gap-2">
        <button
          data-testid="button-audio-toggle"
          onClick={onToggleAmbient}
          className="button-quiet flex items-center gap-2 px-3 py-1.5 text-[10px]"
        >
          <AudioLines size={13} className={sound ? 'text-[#14b8a6] animate-pulse' : 'text-[#627d79]'} />
          <span>{sound ? 'Ambient on' : 'Ambient muted'}</span>
        </button>

        {screen > 0 && (
          <button
            data-testid="button-back"
            onClick={() => onSetScreen((screen - 1) as Screen)}
            className="button-quiet flex items-center gap-1.5 px-3 py-1.5 text-[10px]"
          >
            <ArrowLeft size={13} />
            <span>Back</span>
          </button>
        )}

        <button
          onClick={onReset}
          className="button-quiet hidden items-center gap-1.5 px-2.5 py-1.5 text-[10px] sm:flex"
          title="Restart from Beginning"
        >
          <RotateCcw size={12} />
          <span>Reset</span>
        </button>
      </div>
    </header>
  );
}
