import React from 'react';
import { Skull } from 'lucide-react';
import type { Screen, Stage } from '../../types/necromancer';

interface FooterDockProps {
  screen: Screen;
  stage: Stage;
  stageColor: string;
  onSetScreen: (screen: Screen) => void;
}

export function FooterDock({ screen, stage, stageColor, onSetScreen }: FooterDockProps) {
  const dockItems: { id: Screen; label: string; num: string }[] = [
    { id: 0, label: 'HOME', num: '00' },
    { id: 1, label: 'INTAKE', num: '01' },
    { id: 2, label: 'SCRYING', num: '02' },
    { id: 3, label: 'SQUAD', num: '03' },
    { id: 4, label: 'COURT', num: '04' },
    { id: 5, label: 'TOME', num: '05' },
  ];

  return (
    <footer className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-[96vw] pointer-events-auto">
      <div className="flex items-center gap-1.5 sm:gap-3 rounded-full border border-[#23564f]/75 bg-[#061111]/92 px-3 sm:px-4 py-1.5 sm:py-2 shadow-[0_12px_36px_rgba(0,0,0,0.7)] backdrop-blur-md">
        {/* Leading round indicator */}
        <div className="flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full border border-[#255850] bg-[#0c201d] text-[#29c9a9]">
          <Skull size={12} strokeWidth={1.8} />
        </div>

        {/* Step pill buttons ("bubble thingy") */}
        <nav className="flex items-center gap-0.5 sm:gap-1.5">
          {dockItems.map((item) => {
            const isActive = screen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSetScreen(item.id)}
                className={`flex items-center gap-1.5 rounded-full px-2.5 sm:px-3 py-1 font-mono text-[9px] sm:text-[10px] tracking-wider uppercase transition-all ${
                  isActive
                    ? 'bg-[#14b8a6]/15 text-[#2dd4bf] border border-[#14b8a6]/40 font-semibold shadow-[0_0_12px_rgba(20,184,166,0.3)]'
                    : 'text-[#627d79] hover:text-[#a0c2bd] hover:bg-[#122421]/60'
                }`}
              >
                {isActive && (
                  <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] shadow-[0_0_8px_#10b981]" />
                )}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Vertical divider */}
        <div className="h-3.5 w-px bg-[#1d3d37]" />

        {/* Current stage badge */}
        <div
          className="flex items-center gap-1.5 font-mono text-[8px] sm:text-[9px] font-bold tracking-wider"
          style={{ color: stageColor }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: stageColor, boxShadow: `0 0 6px ${stageColor}` }}
          />
          <span className="hidden xs:inline">{stage.toUpperCase()}</span>
          <span className="text-[#516b67] font-normal">0{screen}/05</span>
        </div>
      </div>
    </footer>
  );
}
