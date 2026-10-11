import React, { type ChangeEvent, type DragEvent, useRef } from 'react';
import {
  WandSparkles, Ghost, FolderUp, FileText, LockKeyhole,
  CircleHelp, Sparkles, ArrowRight, ChevronRight, X
} from 'lucide-react';
import type { Demo, ModeItem, Stage } from '../../types/necromancer';

interface CryptEntranceProps {
  pitch: string;
  stage: Stage;
  files: File[];
  drag: boolean;
  error: string;
  valid: boolean;
  modes: ModeItem[];
  demos: Demo[];
  onPitchChange: (pitch: string) => void;
  onStageChange: (stage: Stage) => void;
  onFilesChange: (files: File[]) => void;
  onDragChange: (drag: boolean) => void;
  onSelectDemo: (demo: Demo) => void;
  onLaunch: () => void;
}

export function CryptEntrance({
  pitch,
  stage,
  files,
  drag,
  error,
  valid,
  modes,
  demos,
  onPitchChange,
  onStageChange,
  onFilesChange,
  onDragChange,
  onSelectDemo,
  onLaunch,
}: CryptEntranceProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const updateFiles = (items: FileList | File[]) => {
    const accepted = Array.from(items).filter((file) =>
      /\.(pdf|csv|xlsx|png|jpe?g)$/i.test(file.name)
    );
    if (accepted.length) {
      onFilesChange([...files, ...accepted]);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    onDragChange(false);
    updateFiles(event.dataTransfer.files);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) updateFiles(event.target.files);
  };

  return (
    <section className="relative z-10 mx-auto max-w-[1440px] px-5 pb-20 pt-8 md:px-10 md:pt-12">
      <div className="mb-6 flex items-center gap-2 text-[10px]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#14b8a6] shadow-[0_0_9px_#14b8a6]" />
        <span className="font-mono tracking-[.14em] text-[#78929e]">
          THE BUSINESS AFTERLIFE ENGINE
        </span>
        <span className="ml-auto hidden font-mono text-[9px] text-[#516770] sm:block">
          FIELD NOTES / 01—05
        </span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.08fr_.92fr] lg:items-stretch">
        <div className="rise-in flex flex-col justify-center py-5 lg:py-12">
          <div className="eyebrow mb-5 flex items-center gap-2">
            <WandSparkles size={13} /> An intelligence séance for founders
          </div>
          <h1 className="font-display max-w-[780px] text-[clamp(3.3rem,8vw,7.35rem)] font-extrabold leading-[.87] tracking-[-.075em] text-[#e6f4f1]">
            Every company<br />leaves a <span className="text-[#19b99c]">ghost.</span>
          </h1>
          <p className="mt-7 max-w-[530px] text-[15px] leading-7 text-[#8da5a8]">
            Summon a squad of specialist agents to question the assumptions, investigate the market, and decide what deserves a second life.
          </p>
          <div className="mt-5 flex items-center gap-3 text-[11px] text-[#667e84]">
            <span className="flex h-7 w-7 items-center justify-center border border-[#243c40] bg-[#0b1718] text-[#16b89b]">
              <Ghost size={15} />
            </span>
            We don’t just evaluate businesses. We put them on trial.
          </div>
          <div className="mt-9 grid max-w-[600px] grid-cols-3 border-y border-[#1c2b34] py-4">
            {[
              ['04', 'company lifecycles'],
              ['06', 'specialist agents'],
              ['01', 'hard question'],
            ].map(([num, label]) => (
              <div key={label} className="border-r border-[#1c2b34] last:border-0">
                <strong className="font-display text-2xl text-[#d4e7e2]">{num}</strong>
                <span className="ml-2 font-mono text-[9px] uppercase tracking-[.06em] text-[#61777e]">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative min-h-[310px] overflow-hidden border border-[#23383e] bg-[#081013] md:min-h-[420px]">
          <img
            src="/assets/hero_banner.jpg"
            alt="A cyber-necromancer conjures ghost analysts above a graveyard of companies"
            className="absolute inset-0 h-full w-full object-cover object-center opacity-[.81]"
            onError={(e) => {
              // Fallback to local chamber image if asset path differs
              const target = e.target as HTMLImageElement;
              if (target.src.indexOf('necromancer-chamber') === -1) {
                target.src = '/necromancer-chamber.png';
              }
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#05080a]/95 via-[#05080a]/35 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#05080a]/95 via-transparent to-[#05080a]/10" />
          <div className="absolute left-5 top-5 flex items-center gap-2 border border-[#385450]/70 bg-[#07100f]/80 px-3 py-2 font-mono text-[9px] uppercase tracking-[.12em] text-[#87c9b8]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#18be9f] spectral-pulse" />
            THE CHAMBER IS OPEN
          </div>
          <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4">
            <div>
              <div className="eyebrow mb-2">Summon / investigate / decide</div>
              <p className="font-display text-2xl font-semibold tracking-tight">
                A boardroom beyond<br />the veil.
              </p>
            </div>
            <div className="hidden items-center gap-2 text-right sm:flex">
              <div className="text-right">
                <span className="font-mono block text-[9px] uppercase tracking-widest text-[#60817a]">
                  The ghost squad
                </span>
                <span className="font-mono text-xs text-[#d2e5dc]">awake & listening</span>
              </div>
              <div className="flex -space-x-2">
                {['#86e5cd', '#a98ddb', '#b7cfd1', '#83a4b9'].map((c) => (
                  <span
                    key={c}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-[#1f3837] bg-[#11201f]"
                    style={{ color: c }}
                  >
                    <Ghost size={14} />
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="absolute bottom-[103px] right-6 hidden rotate-[-8deg] border border-[#3a3734] bg-[#171712]/90 px-4 py-3 text-center sm:block">
            <span className="font-mono block text-[8px] uppercase tracking-[.16em] text-[#9a8a6f]">
              Company graveyard
            </span>
            <span className="font-display text-sm text-[#d6c8aa]">Ideas rest here.</span>
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_310px] lg:items-start">
        <div className="surface relative p-5 md:p-7">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <div className="eyebrow">01 / Place your proposition</div>
              <h2 className="font-display mt-2 text-xl font-semibold">
                What are we bringing back?
              </h2>
            </div>
            <span className="hidden font-mono text-[9px] text-[#647c82] sm:block">
              YOUR INPUT STAYS IN THIS DEMO
            </span>
          </div>

          <label htmlFor="venture-pitch" className="sr-only">
            Describe your business
          </label>
          <textarea
            id="venture-pitch"
            data-testid="input-business-pitch"
            value={pitch}
            onChange={(e) => {
              onPitchChange(e.target.value);
              if (/declin|fall|bleed|struggl/i.test(e.target.value)) {
                onStageChange('Rescue');
              } else if (/closed|shut|dead|died/i.test(e.target.value)) {
                onStageChange('Revive');
              }
            }}
            placeholder="An idea, a company in motion, or a business that has gone quiet…&#10;&#10;Try: “A tiffin meal subscription for students in Pune with three cloud kitchens.”"
            className="min-h-[126px] w-full resize-y border border-[#23383e] bg-[#070d10] px-4 py-4 text-sm leading-6 text-[#d9e8e5] outline-none placeholder:text-[#536a70] focus:border-[#238c7c]"
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="font-mono text-[9px] text-[#526970]">
              {pitch.trim().length}/20 characters minimum ·{' '}
              <span className="text-[#718990]">Private by design</span>
            </div>
            <div className="font-mono text-[9px] text-[#526970]">
              <LockKeyhole size={11} className="mr-1 inline" />
              No uploads leave this demo.
            </div>
          </div>

          <div
            className={`file-drop mt-5 p-4 ${drag ? 'dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              onDragChange(true);
            }}
            onDragLeave={() => onDragChange(false)}
            onDrop={handleDrop}
            data-testid="dropzone-relics"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center border border-[#294345] bg-[#0d1b1d] text-[#28bca1]">
                  <FolderUp size={18} />
                </span>
                <div>
                  <p className="text-xs font-semibold text-[#bed0cc]">
                    Deposit sacred relics
                  </p>
                  <p className="mt-1 text-[10px] text-[#657a80]">
                    Pitch decks, ledgers, old company records
                  </p>
                </div>
              </div>
              <button
                data-testid="button-choose-files"
                type="button"
                onClick={() => fileRef.current?.click()}
                className="button-quiet px-3 py-2 text-[10px]"
              >
                Browse files
              </button>
              <input
                ref={fileRef}
                data-testid="input-files"
                type="file"
                multiple
                accept=".pdf,.csv,.xlsx,.png,.jpg,.jpeg"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {files.length ? (
                files.map((file, i) => (
                  <span
                    key={`${file.name}-${i}`}
                    className="flex items-center gap-2 border border-[#264440] bg-[#0c1b19] px-2.5 py-1.5 font-mono text-[9px] text-[#9bc8b8]"
                  >
                    <FileText size={12} />
                    {file.name}
                    <span className="text-[#5d7e75]">
                      {(file.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      aria-label={`Remove ${file.name}`}
                      onClick={() =>
                        onFilesChange(files.filter((_, index) => index !== i))
                      }
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))
              ) : (
                <span className="font-mono text-[9px] text-[#536770]">
                  PDF · CSV · XLSX · PNG · JPG
                </span>
              )}
            </div>
          </div>

          <div className="mt-7">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <div className="eyebrow">02 / Choose its place on the lifeline</div>
                <p className="mt-1 text-xs text-[#758b8e]">
                  A living company, an idea—or a grave worth opening.
                </p>
              </div>
              <span className="font-mono text-[9px] text-[#526970]">
                STAGE {['Launch', 'Grow', 'Rescue', 'Revive'].indexOf(stage) + 1} / 4
              </span>
            </div>

            <div className="relative mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {modes.map(({ name, label, desc, color, icon: Icon }, i) => (
                <button
                  data-testid={`button-mode-${name.toLowerCase()}`}
                  key={name}
                  type="button"
                  onClick={() => onStageChange(name)}
                  className={`mode-card relative min-h-[125px] overflow-hidden border p-4 text-left ${
                    stage === name
                      ? 'spectral-glow'
                      : 'border-[#1c2b34] bg-[#090f12]'
                  }`}
                  style={
                    {
                      '--aura': color,
                      borderColor: stage === name ? `${color}a8` : undefined,
                      background:
                        stage === name
                          ? `linear-gradient(145deg,${color}16,#0a1114 72%)`
                          : undefined,
                    } as React.CSSProperties
                  }
                >
                  <span className="absolute right-3 top-3 font-mono text-[8px] text-[#42565d]">
                    0{i + 1}
                  </span>
                  <Icon size={19} style={{ color }} />
                  <span className="mt-4 block font-display text-sm font-bold uppercase tracking-[.06em]">
                    {name}
                  </span>
                  <span
                    className="mt-1 block font-mono text-[8px] uppercase tracking-[.07em]"
                    style={{ color }}
                  >
                    {label}
                  </span>
                  <span className="mt-2 block text-[10px] leading-4 text-[#748a8f]">
                    {desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p
              data-testid="status-validation-error"
              className="mt-4 flex items-center gap-2 text-xs text-[#f0807c]"
            >
              <CircleHelp size={14} />
              {error}
            </p>
          )}

          <div className="mt-7 flex flex-col-reverse gap-3 border-t border-[#1b2a30] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-[10px] leading-5 text-[#61767d]">
              No external AI or live research is connected.
              <br />
              Demo summons are clearly marked replays.
            </span>
            <button
              data-testid="button-summon"
              disabled={!valid}
              onClick={onLaunch}
              className="button-primary flex items-center justify-center gap-3 px-6 py-3.5 text-[11px] font-bold uppercase tracking-[.13em]"
            >
              <Sparkles size={16} />
              Summon ghost squad
              <ArrowRight size={15} />
            </button>
          </div>
        </div>

        <aside className="space-y-5">
          <div className="surface p-5">
            <div className="eyebrow">Quick summon / offline replays</div>
            <h3 className="font-display mt-2 text-lg font-semibold">
              No waiting on the veil.
            </h3>
            <p className="mt-2 text-[11px] leading-5 text-[#72878a]">
              Pick a saved scenario to explore the full five-part journey. Sample evidence is illustrative, never live-verified.
            </p>
            <div className="mt-4 space-y-2">
              {demos.map((item, i) => (
                <button
                  data-testid={`button-demo-${i}`}
                  onClick={() => onSelectDemo(item)}
                  key={item.title}
                  className="button-quiet group flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                >
                  <span>
                    <span className="block text-xs font-semibold text-[#bfd2cf]">
                      {item.title}
                    </span>
                    <span className="mt-1 block text-[9px] text-[#657b81]">
                      {item.short}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span
                      className="hidden font-mono text-[8px] uppercase sm:block"
                      style={{
                        color: modes.find((m) => m.name === item.stage)?.color,
                      }}
                    >
                      {item.stage}
                    </span>
                    <ChevronRight
                      size={14}
                      className="text-[#536c70] group-hover:text-[#21bda0]"
                    />
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="graveyard relative min-h-[170px] overflow-hidden border border-[#23383e] p-5">
            <div className="absolute bottom-0 left-0 right-0 flex items-end justify-around opacity-50">
              {[40, 65, 48, 76, 52].map((h, i) => (
                <div
                  key={i}
                  className="relative w-[15%] border border-[#34514c] bg-gradient-to-t from-[#12312b]/60 to-[#11201e]/40"
                  style={{ height: h }}
                >
                  <span className="absolute -top-2 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border border-[#34514c] bg-[#11201e]" />
                </div>
              ))}
            </div>
            <div className="relative">
              <div className="eyebrow">From the graveyard</div>
              <p className="font-display mt-2 text-lg font-semibold">
                Every failure is a<br />case file, not a prophecy.
              </p>
              <p className="mt-2 max-w-[230px] text-[10px] leading-4 text-[#6d8485]">
                Inspect the remnants. Find what changed. Decide if it can live again.
              </p>
            </div>
            <div className="absolute bottom-3 right-4 font-mono text-[8px] tracking-[.14em] text-[#486660]">
              ARCHIVE / 004
            </div>
          </div>
        </aside>
      </div>

      <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-[#1c2b34] pt-5 font-mono text-[9px] uppercase tracking-[.1em] text-[#4d626a]">
        <span>
          Plain code calculates the math. AI estimates assumptions. Sources back every claim.
        </span>
        <span>Necromancer / field system v.01</span>
      </div>
    </section>
  );
}
