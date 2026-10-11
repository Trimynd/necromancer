import { useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react';
import type * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Compare from '@/pages/compare';
import { Header } from '@/components/layout/Header';
import { FooterDock } from '@/components/layout/FooterDock';
import { ScreenTitle } from '@/components/common/ScreenTitle';
import { SectionHeader, LeverRow } from '@/components/common/SectionHeader';
import { DEMOS } from '@/data/demos';
import { MODES } from '@/data/modes';
import type { Stage, Screen, Demo, LeverState, Projections } from '@/types/necromancer';
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, AudioLines,
  BookOpen, Check, CheckCircle2, ChevronRight, CircleHelp, Crosshair,
  Download, FileChartColumn, FileText, Flame, FlaskConical, FolderUp, Ghost,
  HeartPulse, Landmark, Lightbulb, LockKeyhole, RotateCcw, Shield,
  Skull, Sparkles, Swords, TrendingDown, TrendingUp, Users, WandSparkles, X,
  Zap,
} from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Home() {
  const demos = DEMOS;
  const modes = MODES;

  const [screen, setScreen] = useState<Screen>(0);
  const [stage, setStage] = useState<Stage>('Launch');
  const [pitch, setPitch] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');
  const [demo, setDemo] = useState<Demo>(demos[0]);
  const [sound, setSound] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const ambientRef = useRef<{ context: AudioContext; oscillator: OscillatorNode; gain: GainNode } | null>(null);
  const [lever, setLever] = useState<LeverState>({ price: 2500, souls: 65, churn: 4.5, burn: 150000, cac: 1200, partners: 2 });
  
  const chosenMode = modes.find(m => m.name === stage) || modes[0];
  const stageColor = chosenMode.color;
  const valid = pitch.trim().length >= 20 || files.length > 0;

  const projections: Projections = useMemo(() => {
    const startupCost = 800000;
    const variableCost = 1600;
    const churnRate = lever.churn / 100;
    const margin = lever.price - variableCost;
    const ltv = churnRate > 0 ? margin / churnRate : margin * 24;
    const ltvCac = lever.cac > 0 ? ltv / lever.cac : 0;
    const scenario = (factor: number) => {
      let users = 0;
      let cash = -startupCost;
      let breakEven: number | null = null;
      const points = [cash];
      for (let month = 1; month <= 24; month += 1) {
        users = users * (1 + 0.05 * factor) * (1 - churnRate) + lever.souls;
        cash += users * lever.price - (lever.burn + users * variableCost);
        points.push(cash);
        if (breakEven === null && cash >= 0) breakEven = month;
      }
      return { points, cash, breakEven, roi: (cash / startupCost) * 100 };
    };
    return { base: scenario(1), cautious: scenario(0.5), bright: scenario(1.5), ltvCac, ltv, margin };
  }, [lever]);

  const selectDemo = (item: Demo) => {
    setDemo(item);
    setStage(item.stage);
    setPitch(item.pitch);
    setFiles([]);
    setError('');
  };

  const updateFiles = (items: FileList | File[]) => {
    const accepted = Array.from(items).filter(file => /\.(pdf|csv|xlsx|png|jpe?g)$/i.test(file.name));
    if (accepted.length) { setFiles(prev => [...prev, ...accepted]); setError(''); }
    else if (items.length) setError('Relics accepted: PDF, CSV, XLSX, PNG or JPG.');
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDrag(false);
    updateFiles(event.dataTransfer.files);
  };

  const launch = () => {
    if (!valid) { setError('Write at least 20 characters, or deposit a relic to begin.'); return; }
    setError('');
    if (pitch && !demos.find(item => item.pitch === pitch)) {
      setDemo({
        title: 'Untitled venture',
        short: 'A founder’s first summoning',
        stage,
        pitch,
        score: 67,
        verdict: stage === 'Rescue' ? 'RECOVERABLE' : 'PIVOT WITH PROOF',
        subtitle: 'A replay dossier is ready. Treat every number here as an illustrative assumption.',
      });
    } else if (pitch) {
      setDemo(demos.find(item => item.pitch === pitch) || demo);
    }
    setScreen(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const reset = () => {
    setScreen(0);
    setPitch('');
    setFiles([]);
    setError('');
    setStage('Launch');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleAmbient = () => {
    if (ambientRef.current) {
      ambientRef.current.gain.gain.setTargetAtTime(0, ambientRef.current.context.currentTime, 0.12);
      window.setTimeout(() => { ambientRef.current?.oscillator.stop(); ambientRef.current?.context.close(); ambientRef.current = null; }, 450);
      setSound(false);
      return;
    }
    try {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const filter = context.createBiquadFilter();
      oscillator.type = 'sine'; oscillator.frequency.value = 54;
      filter.type = 'lowpass'; filter.frequency.value = 115;
      gain.gain.value = 0;
      oscillator.connect(filter); filter.connect(gain); gain.connect(context.destination);
      oscillator.start();
      gain.gain.setTargetAtTime(0.012, context.currentTime, 0.8);
      ambientRef.current = { context, oscillator, gain };
      setSound(true);
    } catch { setSound(false); }
  };

  const fileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) updateFiles(event.target.files);
  };

  const formatMoney = (n: number) => `${n < 0 ? '−' : ''}₹${Math.abs(n / 100000).toFixed(1)}L`;

  const pathFor = (points: number[], width = 600, height = 220) => {
    const min = Math.min(-200000, ...points), max = Math.max(300000, ...points);
    const span = max - min || 1;
    return points.map((point, i) => `${i ? 'L' : 'M'} ${(i / (points.length - 1)) * width},${height - ((point - min) / span) * (height - 20)}`).join(' ');
  };

  return (
    <main className="app-shell pb-28">
      <div className="ambient-orb" style={{ width: 420, height: 420, top: 130, right: -120, background: stageColor }} />
      
      {/* Sleek Minimal Header */}
      <Header
        screen={screen}
        sound={sound}
        onReset={reset}
        onSetScreen={(s) => { setScreen(s); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
        onToggleAmbient={toggleAmbient}
      />

      {/* Screen 0: Crypt Entrance (Home Page Hero) */}
      {screen === 0 && (
        <section className="relative z-10 mx-auto max-w-[1360px] px-5 pb-16 pt-6 md:px-10 md:pt-10">
          <div className="mb-5 flex items-center gap-2 text-[10px]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#14b8a6] shadow-[0_0_9px_#14b8a6]"/>
            <span className="font-mono tracking-[.14em] text-[#78929e]">THE BUSINESS AFTERLIFE ENGINE</span>
            <span className="ml-auto hidden font-mono text-[9px] text-[#516770] sm:block">FIELD NOTES / 01—05</span>
          </div>

          <div className="grid gap-8 lg:grid-cols-[1.12fr_.88fr] lg:items-center">
            <div className="rise-in flex flex-col justify-center py-2 lg:py-6">
              <div className="eyebrow mb-4 flex items-center gap-2">
                <WandSparkles size={12}/> An intelligence séance for founders
              </div>
              <h1 className="font-display max-w-[640px] text-3xl sm:text-4xl md:text-[2.85rem] font-extrabold leading-[1.08] tracking-[-0.035em] text-[#e6f4f1]">
                Every company<br/>leaves a <span className="text-[#19b99c]">ghost.</span>
              </h1>
              <p className="mt-5 max-w-[480px] text-xs sm:text-sm leading-6 text-[#8da5a8]">
                Summon a squad of specialist agents to question the assumptions, investigate the market, and decide what deserves a second life.
              </p>
              <div className="mt-4 flex items-center gap-2.5 text-[11px] text-[#667e84]">
                <span className="flex h-6 w-6 items-center justify-center border border-[#243c40] bg-[#0b1718] text-[#16b89b]">
                  <Ghost size={13}/>
                </span>
                We don’t just evaluate businesses. We put them on trial.
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  data-testid="button-enter-chamber"
                  onClick={() => { setScreen(1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="button-primary flex items-center gap-2 px-5 py-3 text-[11px] font-bold uppercase tracking-wider"
                >
                  <Sparkles size={14}/>
                  <span>Enter the Chamber</span>
                  <ArrowRight size={14}/>
                </button>
                <button
                  onClick={() => { selectDemo(demos[0]); setScreen(1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="button-quiet flex items-center gap-2 px-4 py-3 text-[10px]"
                >
                  <span>Quick Demo: Pune Tiffin</span>
                  <ChevronRight size={13}/>
                </button>
              </div>

              <div className="mt-8 grid max-w-[540px] grid-cols-3 border-y border-[#1c2b34] py-3.5">
                {[['04', 'company lifecycles'], ['06', 'specialist agents'], ['01', 'hard question']].map(([num, label]) => (
                  <div key={label} className="border-r border-[#1c2b34] last:border-0 pr-3">
                    <strong className="font-display text-xl text-[#d4e7e2]">{num}</strong>
                    <span className="ml-2 font-mono text-[8px] uppercase tracking-[.06em] text-[#61777e]">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative min-h-[290px] overflow-hidden border border-[#23383e] bg-[#081013] md:min-h-[380px]">
              <img
                src="/necromancer-chamber.png"
                alt="A cyber-necromancer conjures ghost analysts above a graveyard of companies"
                className="absolute inset-0 h-full w-full object-cover object-center opacity-[.85]"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#05080a]/95 via-[#05080a]/30 to-transparent"/>
              <div className="absolute inset-0 bg-gradient-to-t from-[#05080a]/95 via-transparent to-[#05080a]/15"/>
              <div className="absolute left-4 top-4 flex items-center gap-2 border border-[#385450]/70 bg-[#07100f]/80 px-2.5 py-1.5 font-mono text-[8px] uppercase tracking-[.12em] text-[#87c9b8]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#18be9f] spectral-pulse"/>THE CHAMBER IS OPEN
              </div>
              <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
                <div>
                  <div className="eyebrow mb-1 text-[9px]">Summon / investigate / decide</div>
                  <p className="font-display text-xl font-semibold tracking-tight text-[#e6f4f1]">A boardroom beyond<br/>the veil.</p>
                </div>
                <div className="hidden items-center gap-2 text-right sm:flex">
                  <div className="text-right">
                    <span className="font-mono block text-[8px] uppercase tracking-widest text-[#60817a]">The ghost squad</span>
                    <span className="font-mono text-[11px] text-[#d2e5dc]">awake & listening</span>
                  </div>
                  <div className="flex -space-x-1.5">
                    {['#86e5cd','#a98ddb','#b7cfd1','#83a4b9'].map((c) => (
                      <span key={c} className="flex h-7 w-7 items-center justify-center rounded-full border border-[#1f3837] bg-[#11201f]" style={{color:c}}>
                        <Ghost size={12}/>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="absolute bottom-[92px] right-5 hidden rotate-[-8deg] border border-[#3a3734] bg-[#171712]/90 px-3 py-2 text-center sm:block">
                <span className="font-mono block text-[7px] uppercase tracking-[.16em] text-[#9a8a6f]">Company graveyard</span>
                <span className="font-display text-xs text-[#d6c8aa]">Ideas rest here.</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Screen 1: Proposition Intake (Place Your Proposition) */}
      {screen === 1 && (
        <section className="relative z-10 mx-auto max-w-[1360px] px-5 pb-20 pt-6 md:px-10 md:pt-10">
          <div className="mb-6 flex items-center justify-between border-b border-[#1c2b34] pb-4">
            <div>
              <div className="eyebrow flex items-center gap-2"><Sparkles size={12}/> 01 / Place your proposition</div>
              <h2 className="font-display mt-1 text-2xl sm:text-3xl font-bold text-[#e6f4f1]">What are we bringing back?</h2>
              <p className="mt-1 text-xs text-[#82979a]">Describe your business or select a pre-recorded case file to begin.</p>
            </div>
            <span className="hidden font-mono text-[9px] text-[#647c82] sm:block">YOUR INPUT STAYS IN THIS DEMO</span>
          </div>

          <div className="grid gap-8 lg:grid-cols-[1fr_310px] lg:items-start">
            <div className="surface relative p-5 md:p-7">
              <label htmlFor="venture-pitch" className="sr-only">Describe your business</label>
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-[9px] uppercase tracking-wider text-[#698884]">Describe your business</span>
                <span className="font-mono text-[9px] text-[#526970]">MIN 20 CHARS</span>
              </div>
              <textarea
                id="venture-pitch"
                data-testid="input-business-pitch"
                value={pitch}
                onChange={e => {
                  setPitch(e.target.value);
                  setError('');
                  if (/declin|fall|bleed|struggl/i.test(e.target.value)) setStage('Rescue');
                  else if (/closed|shut|dead|died/i.test(e.target.value)) setStage('Revive');
                }}
                placeholder="An idea, a company in motion, or a business that has gone quiet…&#10;&#10;Try: “A tiffin meal subscription for students in Pune with three cloud kitchens.”"
                className="min-h-[120px] w-full resize-y border border-[#23383e] bg-[#070d10] px-4 py-3.5 text-xs sm:text-sm leading-6 text-[#d9e8e5] outline-none placeholder:text-[#536a70] focus:border-[#238c7c]"
              />
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
                <div className="font-mono text-[9px] text-[#526970]">{pitch.trim().length}/20 characters minimum · <span className="text-[#718990]">Private by design</span></div>
                <div className="font-mono text-[9px] text-[#526970]"><LockKeyhole size={10} className="mr-1 inline"/>No uploads leave this demo.</div>
              </div>

              <div className={`file-drop mt-5 p-4 ${drag ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop} data-testid="dropzone-relics">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center border border-[#294345] bg-[#0d1b1d] text-[#28bca1]"><FolderUp size={16}/></span>
                    <div>
                      <p className="text-xs font-semibold text-[#bed0cc]">Deposit sacred relics</p>
                      <p className="mt-0.5 text-[10px] text-[#657a80]">Pitch decks, ledgers, old company records</p>
                    </div>
                  </div>
                  <button data-testid="button-choose-files" onClick={() => fileRef.current?.click()} className="button-quiet px-3 py-1.5 text-[10px]">Browse files</button>
                  <input ref={fileRef} data-testid="input-files" type="file" multiple accept=".pdf,.csv,.xlsx,.png,.jpg,.jpeg" onChange={fileChange} className="hidden"/>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {files.length ? files.map((file, i) => (
                    <span key={`${file.name}-${i}`} className="flex items-center gap-2 border border-[#264440] bg-[#0c1b19] px-2.5 py-1 font-mono text-[9px] text-[#9bc8b8]">
                      <FileText size={11}/>{file.name}<span className="text-[#5d7e75]">{(file.size/1024).toFixed(0)} KB</span>
                      <button aria-label={`Remove ${file.name}`} onClick={() => setFiles(files.filter((_, index) => index !== i))}><X size={11}/></button>
                    </span>
                  )) : <span className="font-mono text-[9px] text-[#536a70]">PDF · CSV · XLSX · PNG · JPG</span>}
                </div>
              </div>

              <div className="mt-6">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <div className="eyebrow">02 / Choose its place on the lifeline</div>
                    <p className="mt-1 text-xs text-[#758b8e]">A living company, an idea—or a grave worth opening.</p>
                  </div>
                  <span className="font-mono text-[9px] text-[#526970]">STAGE {['Launch','Grow','Rescue','Revive'].indexOf(stage)+1} / 4</span>
                </div>
                <div className="relative mt-3.5 grid grid-cols-2 gap-3 md:grid-cols-4">
                  {modes.map(({name,label,desc,color,icon:Icon},i)=>(
                    <button
                      data-testid={`button-mode-${name.toLowerCase()}`}
                      key={name}
                      onClick={() => setStage(name)}
                      className={`mode-card relative min-h-[118px] overflow-hidden border p-3.5 text-left ${stage === name ? 'spectral-glow' : 'border-[#1c2b34] bg-[#090f12]'}`}
                      style={{'--aura': color, borderColor:stage===name?`${color}a8`:undefined, background:stage===name?`linear-gradient(145deg,${color}16,#0a1114 72%)`:undefined} as React.CSSProperties}
                    >
                      <span className="absolute right-2.5 top-2.5 font-mono text-[8px] text-[#42565d]">0{i+1}</span>
                      <Icon size={17} style={{color}}/>
                      <span className="mt-3 block font-display text-xs font-bold uppercase tracking-[.06em] text-[#e6f4f1]">{name}</span>
                      <span className="mt-0.5 block font-mono text-[8px] uppercase tracking-[.07em]" style={{color}}>{label}</span>
                      <span className="mt-1.5 block text-[9px] leading-3.5 text-[#748a8f]">{desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {error && <p data-testid="status-validation-error" className="mt-4 flex items-center gap-2 text-xs text-[#f0807c]"><CircleHelp size={13}/>{error}</p>}

              <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[#1b2a30] pt-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-[9px] leading-4 text-[#61767d]">No external AI or live research is connected.<br/>Demo summons are clearly marked replays.</span>
                <button data-testid="button-summon" disabled={!valid} onClick={launch} className="button-primary flex items-center justify-center gap-2 px-5 py-3 text-[10px] font-bold uppercase tracking-[.12em]">
                  <Sparkles size={14}/><span>Summon ghost squad</span><ArrowRight size={13}/>
                </button>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="surface p-4 sm:p-5">
                <div className="eyebrow">Quick summon / offline replays</div>
                <h3 className="font-display mt-1.5 text-base font-semibold text-[#e6f4f1]">No waiting on the veil.</h3>
                <p className="mt-1.5 text-[10px] leading-4 text-[#72878a]">Pick a saved scenario to explore the full five-part journey.</p>
                <div className="mt-3.5 space-y-2">
                  {demos.map((item,i)=>(
                    <button
                      data-testid={`button-demo-${i}`}
                      onClick={() => selectDemo(item)}
                      key={item.title}
                      className={`button-quiet group flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left ${demo.title === item.title ? 'border-[#14b8a6]/60 bg-[#14b8a6]/10' : ''}`}
                    >
                      <span>
                        <span className="block text-xs font-semibold text-[#bfd2cf]">{item.title}</span>
                        <span className="mt-0.5 block text-[8px] text-[#657b81]">{item.short}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono text-[7px] uppercase" style={{color:modes.find(m=>m.name===item.stage)?.color}}>{item.stage}</span>
                        <ChevronRight size={13} className="text-[#536c70] group-hover:text-[#21bda0]"/>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="graveyard relative min-h-[160px] overflow-hidden border border-[#23383e] p-4">
                <img src="/company-graveyard.png" alt="" className="absolute inset-0 h-full w-full object-cover opacity-20 pointer-events-none"/>
                <div className="relative">
                  <div className="eyebrow text-[9px]">From the graveyard</div>
                  <p className="font-display mt-1.5 text-base font-semibold text-[#e6f4f1]">Every failure is a<br/>case file, not a prophecy.</p>
                  <p className="mt-1.5 max-w-[210px] text-[9px] leading-4 text-[#7e9798]">Inspect the remnants. Find what changed. Decide if it can live again.</p>
                </div>
                <div className="absolute bottom-2.5 right-3 font-mono text-[7px] tracking-[.14em] text-[#486660]">ARCHIVE / 004</div>
              </div>
            </aside>
          </div>
        </section>
      )}

      {/* Screen 2: The Scrying Pool */}
      {screen === 2 && (
        <section className="relative z-10 mx-auto max-w-[1200px] px-5 py-7 md:px-10 md:py-10">
          <ScreenTitle index="02" title="The Scrying Pool" subtitle="Before a verdict, we need to know what survived the telling." color="#14b8a6"/>
          <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
            <div className="space-y-4">
              {files.length > 0 && (
                <div className="surface p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-[#39c9aa]"><FileChartColumn size={15}/><span className="eyebrow">What the spirits extracted</span></div>
                  <p className="mt-1.5 text-xs text-[#bacbc8]">Relics received: {files.map(file=>file.name).join(', ')}</p>
                  <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2">
                    {[['Business description', 'Founder-provided context'],['Financial history','Needs human verification'],['Cash runway','Not confirmed in relics'],['Stage','Founder-selected: '+stage]].map(([k,v])=>(
                      <div key={k} className="border border-[#1c3034] bg-[#081013] p-2.5">
                        <span className="font-mono block text-[8px] uppercase text-[#58716f]">{k}</span>
                        <span className="mt-0.5 block text-xs text-[#a9bfbb]">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="surface p-4 sm:p-5">
                <div className="flex items-center justify-between"><span className="eyebrow">The founder's account</span><span className="font-mono text-[8px] text-[#63797d]">{pitch.length} chars</span></div>
                <blockquote className="mt-3 border-l-2 border-[#168c78] pl-3.5 text-xs sm:text-sm leading-6 text-[#d0dedb]">{pitch || demo.pitch}</blockquote>
                <div className="mt-3 flex items-center gap-2 text-[10px] text-[#71898b]">
                  <span className="h-1.5 w-1.5 rounded-full" style={{background:stageColor}}/>
                  Selected stage: <strong style={{color:stageColor}}>{stage}</strong>
                  <span className="font-mono text-[8px] text-[#4e666b]">/ {chosenMode.label}</span>
                </div>
              </div>

              <div className="surface p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="eyebrow">02 / Set starting conditions</div>
                    <h3 className="font-display mt-1 text-lg font-semibold text-[#e6f4f1]">Refine initial parameters.</h3>
                  </div>
                  <span className="font-mono text-xs text-[#17b99c]">03 / 04</span>
                </div>
                <div className="mt-4 h-1 w-full bg-[#17282d]"><div className="h-full w-3/4 bg-[#14b8a6]"/></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[['Treasury / starting budget','₹','input-budget'],['Monthly fixed burn','₹','input-burn']].map(([label,pre,id])=>(
                    <label key={id} className="block">
                      <span className="mb-1.5 block text-[9px] text-[#7b9193]">{label}</span>
                      <div className="flex items-center border border-[#24383d] bg-[#071013] px-3">
                        <span className="font-mono text-xs text-[#62847e]">{pre}</span>
                        <input data-testid={id} type="number" placeholder={id==='input-budget'?'1200000':'150000'} className="w-full bg-transparent px-2 py-2.5 font-mono text-xs text-[#d6e5e0] outline-none"/>
                      </div>
                    </label>
                  ))}
                  <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-[9px] text-[#7b9193]">Target early customer hypothesis</span>
                    <input data-testid="input-target-customer" placeholder="A specific reachable user group, not a TAM calculation…" className="w-full border border-[#24383d] bg-[#071013] px-3 py-2.5 text-xs text-[#d6e5e0] outline-none placeholder:text-[#40575c] focus:border-[#168c78]"/>
                  </label>
                </div>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="surface p-4 sm:p-5">
                <div className="eyebrow">The company lifeline</div>
                <svg viewBox="0 0 420 155" className="mt-3 w-full" aria-label="Company lifecycle curve">
                  <path d="M10 124 C64 124 64 58 110 58 C154 58 147 25 204 25 C266 25 242 90 310 105 C355 114 350 130 405 124" fill="none" stroke="#20363a" strokeWidth="2"/>
                  <path d="M10 124 C64 124 64 58 110 58 C154 58 147 25 204 25 C266 25 242 90 310 105 C355 114 350 130 405 124" fill="none" stroke={stageColor} strokeWidth="2" strokeDasharray="220" strokeDashoffset="100"/>
                  {[['LAUNCH',42,105],['GROW',165,42],['RESCUE',294,104],['REVIVE',377,122]].map(([label,x,y])=>(
                    <g key={label}>
                      <circle cx={x} cy={y} r={stage.toUpperCase()===label?7:3.5} fill={stage.toUpperCase()===label?stageColor:'#56706e'} stroke="#081013" strokeWidth="2.5"/>
                      <text x={x} y={Number(y)+22} textAnchor="middle" fill="#78929e" fontSize="7.5" fontFamily="IBM Plex Mono">{label}</text>
                    </g>
                  ))}
                </svg>
                <p className="mt-2 text-[9px] leading-4 text-[#6d8386]">A working hypothesis, not an AI inference. Change stage at any time.</p>
              </div>

              <div className="surface p-4 sm:p-5">
                <div className="eyebrow">Assembled grimoire</div>
                <h3 className="font-display mt-2 text-base font-semibold text-[#e6f4f1]">{demo.title}</h3>
                <div className="mt-3 space-y-2.5">
                  {[['Stage',stage],['Initial prompt',pitch.length>80?pitch.slice(0,80)+'…':pitch],['Relics',files.length?`${files.length} file(s) attached`:'None provided']].map(([label,value])=>(
                    <div key={label} className="border-t border-[#1c2b30] pt-2">
                      <span className="font-mono block text-[7px] uppercase tracking-[.12em] text-[#57706f]">{label}</span>
                      <span className="mt-0.5 block text-[10px] leading-4 text-[#a7bcb8]">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button data-testid="button-begin-research" onClick={() => { setScreen(3); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="button-primary flex w-full items-center justify-center gap-2 px-4 py-3 text-[10px] font-bold uppercase tracking-[.12em]">
                <Sparkles size={14}/><span>Begin necromantic research</span><ArrowRight size={14}/>
              </button>
            </aside>
          </div>
        </section>
      )}

      {/* Screen 3: The Summoning Circle */}
      {screen === 3 && (
        <section className="relative z-10 mx-auto max-w-[1200px] px-5 py-7 md:px-10 md:py-10">
          <ScreenTitle index="03" title="The Summoning Circle" subtitle="A role-maker assembles a squad for this case. The scene below is a saved demonstration." color="#a855f7"/>
          <div className="surface relative mt-6 overflow-hidden p-5 md:p-7">
            <div className="relative flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="eyebrow text-[9px]" style={{color:'#c285ed'}}>ROLE MAKER / GEMMA · REPLAY</div>
                <h2 className="font-display mt-2 max-w-xl text-2xl font-bold tracking-tight text-[#e6f4f1] md:text-3xl">
                  Summoning specialists for <span className="text-[#bb82e5]">{demo.title}.</span>
                </h2>
                <p className="mt-2 max-w-lg text-[11px] leading-5 text-[#839799]">The roles below are an offline sample assembled to demonstrate adversarial evaluation.</p>
              </div>
              <div className="border border-[#49305d] bg-[#170f1c] px-2.5 py-1.5 font-mono text-[8px] text-[#bd8ce1]">
                <Ghost size={12} className="mr-1.5 inline"/>4 entities manifested
              </div>
            </div>
            <div className="rune-rule my-5"/>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {title:'The Market Wraith',special:'Demand & positioning',icon:Crosshair,mission:'Tests the customer need against existing ways people solve this problem.',feeds:['Market','Demand'],col:'#19b99c'},
                {title:'The Treasury Shade',special:'Unit economics',icon:Landmark,mission:'Follows the money: costs, margin, runway, and where the model thins.',feeds:['Treasury','Sandbox'],col:'#69a7d4'},
                {title:'The Rival Specter',special:'Competitive pressure',icon:Shield,mission:'Maps alternatives, switching friction, and likely counter-moves.',feeds:['Rivals','Moat'],col:'#c18ae3'},
                {title:'The Grand Inquisitor',special:'Adversarial review',icon:Flame,mission:'Builds the strongest case against the founder’s preferred outcome.',feeds:['Risks','Verdict'],col:'#eb736a'},
              ].map((agent,i)=>(
                <article data-testid={`card-agent-${i}`} key={agent.title} className="surface-soft spectral-pulse min-h-[200px] p-4" style={{'--aura':agent.col} as React.CSSProperties}>
                  <div className="flex items-start justify-between">
                    <span className="flex h-9 w-9 items-center justify-center border border-[#2a4244] bg-[#0b1517]" style={{color:agent.col}}><agent.icon size={17}/></span>
                    <span className="font-mono text-[8px] text-[#58706d]">ENTITY 0{i+1}</span>
                  </div>
                  <div className="mt-4 font-display text-sm font-bold text-[#e6f4f1]">{agent.title}</div>
                  <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[.08em]" style={{color:agent.col}}>{agent.special}</div>
                  <p className="mt-2.5 text-[9px] leading-4 text-[#829697]">{agent.mission}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {agent.feeds.map(feed=><span key={feed} className="border border-[#273a3d] bg-[#091214] px-1.5 py-0.5 font-mono text-[7px] text-[#75908b]">{feed}</span>)}
                  </div>
                </article>
              ))}
            </div>
          </div>
          <div className="mt-5 flex flex-col-reverse justify-between gap-3 sm:flex-row">
            <button data-testid="button-edit-intake" onClick={() => { setScreen(1); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="button-quiet flex items-center justify-center gap-2 px-4 py-2.5 text-[10px]">
              <ArrowLeft size={13}/><span>Return to proposition</span>
            </button>
            <button data-testid="button-open-courtroom" onClick={() => { setScreen(4); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="button-primary flex items-center justify-center gap-2 px-5 py-2.5 text-[10px] font-bold uppercase tracking-[.12em]">
              <Swords size={14}/><span>Enter the spectral courtroom</span><ArrowRight size={13}/>
            </button>
          </div>
        </section>
      )}

      {/* Screen 4: The Spectral Courtroom */}
      {screen === 4 && (
        <section className="relative z-10 mx-auto max-w-[1140px] px-5 py-7 md:px-10 md:py-10">
          <ScreenTitle index="04" title="The Spectral Courtroom" subtitle="A replay of the deliberation theatre. Its evidence is an illustration, not a verified finding." color="#14b8a6"/>
          <div className="surface mt-6 p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-[#18b99b]"><span className="h-1.5 w-1.5 rounded-full bg-[#14b8a6] spectral-pulse"/><span className="eyebrow text-[9px]">Demo replay / parallel deliberation</span></div>
                <h2 className="font-display mt-2 text-lg font-semibold text-[#e6f4f1]">{demo.title} · 4/4 parallel audits complete</h2>
              </div>
              <div className="border border-[#254943] bg-[#0b211c] px-2.5 py-1.5 font-mono text-[8px] text-[#80cbb5]">VERDICT ASSEMBLED</div>
            </div>
            <div className="mt-4 h-1 w-full bg-[#17272d]"><div className="h-full w-full bg-gradient-to-r from-[#14b8a6] to-[#a855f7]"/></div>

            <div className="mt-5 grid gap-2 md:grid-cols-4">
              {[
                ['Market Wraith','Reviewing customer need','8 sample observations'],
                ['Treasury Shade','Modeling unit economics','6 sample assumptions'],
                ['Rival Specter','Comparing alternatives','4 sample competitors'],
                ['Grand Inquisitor','Attacking the thesis','3 failure paths'],
              ].map(([name,status,count])=>(
                <div key={name} className="surface-soft flex items-center gap-2.5 p-2.5">
                  <span className="flex h-7 w-7 items-center justify-center border border-[#24423e] bg-[#0c1919] text-[#36c6a7]"><Ghost size={13}/></span>
                  <div className="min-w-0">
                    <p className="truncate text-[9px] font-semibold text-[#c1d3ce]">{name}</p>
                    <p className="mt-0.5 text-[8px] text-[#718789]">{status}</p>
                  </div>
                  <CheckCircle2 size={13} className="ml-auto shrink-0 text-[#16a889]"/>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
              <div className="border border-[#1e3238] bg-[#060b0e]">
                <div className="flex items-center justify-between border-b border-[#1c2b30] px-3.5 py-2.5">
                  <span className="font-mono text-[8px] uppercase tracking-[.1em] text-[#78918f]"><Activity size={11} className="mr-1.5 inline text-[#20b99c]"/>Ethereal stream transcript</span>
                  <span className="font-mono text-[7px] text-[#4f6769]">STATIC REPLAY</span>
                </div>
                <div className="space-y-2.5 px-3.5 py-3">
                  {[
                    ['00:00:04','Market Wraith','The founder names a specific customer, but repeat-purchase frequency remains untested.'],
                    ['00:00:11','Treasury Shade','Illustrative contribution margin is sensitive to delivery cost and customer retention.'],
                    ['00:00:19','Rival Specter','Incumbents can bundle the service; local familiarity may offer a narrow opening.'],
                    ['00:00:27','Grand Inquisitor','The venture fails if acquisition cost rises before the second order arrives.'],
                  ].map(([time,agent,text])=>(
                    <div key={time} className="terminal-line flex gap-2.5 text-[9px] leading-4">
                      <span className="time shrink-0 font-mono text-[7px]">{time}</span>
                      <span className="shrink-0 font-mono text-[#36b69c]">{agent}</span>
                      <span>{text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-[#783837]/55 bg-[#180e10] p-4 sm:p-5">
                <div className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[.12em] text-[#ee8178]"><Flame size={13}/>The Grand Inquisitor’s assault</div>
                <p className="font-display mt-3 text-base leading-6 text-[#e9d6d1]">“What if the thing you call demand is only curiosity—and every new customer costs more than the last?”</p>
                <p className="mt-2 text-[10px] leading-5 text-[#a88a87]">The model does not survive high acquisition combined with early churn. Run a small measurable test that reaches a second purchase.</p>
                <div className="mt-4 border-t border-[#663534]/60 pt-3">
                  <span className="font-mono text-[7px] uppercase tracking-[.12em] text-[#bb7770]">The charge</span>
                  <p className="mt-1 text-[11px] leading-4 text-[#d6aaa3]">Optimism is not a retention strategy. Prove repeat behavior, or the growth curve is a beautiful lie.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col-reverse justify-between gap-3 sm:flex-row">
            <button data-testid="button-back-summoning" onClick={() => { setScreen(3); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="button-quiet flex items-center justify-center gap-2 px-4 py-2.5 text-[10px]">
              <ArrowLeft size={13}/><span>Back to squad</span>
            </button>
            <button data-testid="button-synthesize-report" onClick={() => { setScreen(5); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="button-primary flex items-center justify-center gap-2 px-5 py-2.5 text-[10px] font-bold uppercase tracking-[.12em]">
              <WandSparkles size={14}/><span>Open the tome of prophecy</span><ArrowRight size={13}/>
            </button>
          </div>
        </section>
      )}

      {/* Screen 5: The Tome of Prophecy (Complete Decision Dossier with All Charts) */}
      {screen === 5 && (
        <section className="relative z-10 mx-auto max-w-[1400px] px-5 py-7 md:px-10 md:py-10">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[#1c2b34] pb-4">
            <div>
              <div className="eyebrow flex items-center gap-2"><BookOpen size={12}/>05 / Tome of prophecy · decision dossier</div>
              <h1 className="font-display mt-1 text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-[#e6f4f1]">{demo.title}</h1>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-[#819697]">{demo.subtitle}</p>
            </div>
            <div className="flex gap-2">
              <button data-testid="button-export-report" onClick={() => window.print()} className="button-quiet flex items-center gap-1.5 px-3 py-1.5 text-[10px]">
                <Download size={12}/><span>Print dossier</span>
              </button>
              <button data-testid="button-restart-report" onClick={reset} className="button-quiet flex items-center gap-1.5 px-3 py-1.5 text-[10px]">
                <RotateCcw size={12}/><span>New case</span>
              </button>
            </div>
          </div>

          <div className="mb-5 flex items-start gap-2.5 border border-[#664d2a]/65 bg-[#17140d] p-3 text-[10px] text-[#b7a882]">
            <CircleHelp size={14} className="mt-0.5 shrink-0 text-[#e9b34d]"/>
            <span><strong className="text-[#e5ce99]">DEMO / NOT VERIFIED:</strong> Saved illustrative content for interface exploration. All sandbox outputs are deterministic client-side projections from editable assumptions.</span>
          </div>

          <div className="grid gap-6 lg:grid-cols-[190px_1fr]">
            <aside className="report-nav hidden lg:block">
              <div className="sticky top-6 border border-[#1c2b34] bg-[#0a1114] p-3.5 space-y-1">
                <div className="eyebrow mb-2 text-[8px]">On this page</div>
                {[
                  ['verdict','01 Verdict'],
                  ['curse','02 Cursed assumption'],
                  ['scores','03 Hex scores'],
                  ['impact','04 Pros & cons'],
                  ['rivals','05 Rivals arena'],
                  ['market','06 Market domain'],
                  ['treasury','07 Treasury runway'],
                  ['sandbox','08 Alchemical sandbox'],
                  ['rituals','09 Mode ritual'],
                ].map(([id,label])=>(
                  <a key={id} href={`#${id}`} className="block border-l border-[#22353a] py-1.5 pl-2.5 text-[9px] text-[#71878e] hover:text-[#14b8a6] hover:border-[#14b8a6]">
                    {label}
                  </a>
                ))}
              </div>
            </aside>

            <div className="min-w-0 space-y-5">
              {/* Verdict Radial Gauge */}
              <section id="verdict" className="surface relative overflow-hidden p-5 md:p-6">
                <div className="relative grid gap-5 md:grid-cols-[160px_1fr] md:items-center">
                  <div className="relative mx-auto h-[140px] w-[140px]">
                    <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
                      <circle cx="80" cy="80" r="66" fill="none" stroke="#1b2d32" strokeWidth="7"/>
                      <circle cx="80" cy="80" r="66" fill="none" stroke={demo.score>=70?'#10b981':demo.score>=40?'#eab308':'#ef4444'} strokeWidth="7" strokeDasharray={`${2*Math.PI*66*demo.score/100} ${2*Math.PI*66}`} strokeLinecap="round"/>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-display text-4xl font-bold text-[#e6f4f1]">{demo.score}</span>
                      <span className="font-mono text-[7px] uppercase tracking-[.12em] text-[#6f8589]">score / 100</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="eyebrow text-[9px]">The provisional verdict</span>
                      <span className="border border-[#275744] bg-[#0c2118] px-2 py-0.5 font-mono text-[8px] text-[#51d69d]">{demo.verdict}</span>
                      <span className="font-mono text-[7px] text-[#607578]">ILLUSTRATIVE</span>
                    </div>
                    <h2 className="font-display mt-2 text-xl font-bold leading-snug text-[#e6f4f1] md:text-2xl">{demo.subtitle}</h2>
                    <p className="mt-2 text-xs leading-5 text-[#819695]">The strongest next move is to shrink uncertainty, not scale the story. This directional verdict is a teaching example only.</p>
                  </div>
                </div>
              </section>

              {/* Curse & Inquisitor */}
              <section id="curse" className="grid gap-4 md:grid-cols-2">
                <article className="surface p-4 sm:p-5">
                  <div className="eyebrow flex items-center gap-1.5"><FlaskConical size={13}/>The cursed assumption</div>
                  <h3 className="font-display mt-2 text-base font-semibold text-[#e6f4f1]">The most dangerous belief</h3>
                  <p className="mt-2 text-xs leading-5 text-[#a8bcb8]">“The first buyers will return often enough to cover the cost of finding them.”</p>
                  <div className="mt-3 border-l border-[#eab308] bg-[#13150f] px-3 py-2 text-[9px]">
                    <span className="font-mono uppercase text-[#d8b655]">Cheap exorcism</span>
                    <p className="mt-1 text-[#b2aa8e]">Run a 2-week cohort test with a capped acquisition budget. Measure second purchase, not sign-up intent.</p>
                  </div>
                </article>

                <article className="border border-[#633534]/60 bg-[#150d0f] p-4 sm:p-5">
                  <div className="eyebrow flex items-center gap-1.5 text-[#ee7c74]"><Flame size={13}/>Inquisitor’s indictment</div>
                  <h3 className="font-display mt-2 text-base font-semibold text-[#eadbd7]">Curiosity is not retention.</h3>
                  <p className="mt-2 text-xs leading-5 text-[#ad8d88]">If acquisition costs rise while repeat demand stays unproven, margin disappears before useful scale.</p>
                  <div className="mt-3 flex items-center gap-2 border-t border-[#603331]/55 pt-2 text-[9px] text-[#8d6b65]">
                    <span className="border border-[#805d24] bg-[#2a2010] px-1.5 py-0.5 font-mono text-[7px] text-[#e3bd63]">SURVIVES WITH TRANSMUTATION</span>
                    <span>only if the cohort test passes</span>
                  </div>
                </article>
              </section>

              {/* Hexagonal Dimensional Scores */}
              <section id="scores" className="surface p-4 sm:p-6">
                <SectionHeader icon={Crosshair} eyebrow="Analytical dimensions" title="Hexagonal scores" note="Illustrative ratings"/>
                <div className="mt-4 grid gap-x-8 gap-y-3.5 md:grid-cols-2">
                  {[
                    ['Market demand',71,'25%','Early interest, repeat behavior not established'],
                    ['Financial viability',62,'25%','Sensitive to variable delivery / service costs'],
                    ['Competitive moat',48,'15%','Differentiation needs direct customer proof'],
                    ['Execution capacity',76,'15%','Initial scope is small enough to test'],
                    ['Regulatory feasibility',83,'10%','No specialist review was performed'],
                    ['Macro timing',67,'10%','Directional assumption only'],
                  ].map(([label,value,weight,why])=>(
                    <div key={label as string} title={why as string}>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-[#a5b9b6]">{label}</span>
                        <span className="font-mono text-[#74908a]">{value}<span className="ml-1.5 text-[#4e666a]">{weight}</span></span>
                      </div>
                      <div className="mt-1.5 h-1.5 bg-[#1b2b30]">
                        <div className="h-full" style={{width:`${value}%`,background:Number(value)>70?'#14b8a6':Number(value)>55?'#eab308':'#e87971'}}/>
                      </div>
                      <p className="mt-1 text-[8px] text-[#5e7478]">{why}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Impact / Headwinds & Tailwinds */}
              <section id="impact" className="grid gap-4 md:grid-cols-2">
                <div className="surface p-4 sm:p-5">
                  <SectionHeader icon={ArrowUpRight} eyebrow="Tailwinds" title="What may be in its favor"/>
                  <div className="mt-3 space-y-2">
                    {['A specific first customer can be reached directly.','A small test can answer a key question without heavy infrastructure.','Founder insight may be useful if translated into observed behavior.'].map((item,i)=>(
                      <div key={item} className="flex gap-2.5 border-t border-[#1c2a2f] pt-2 text-[10px] leading-4 text-[#9fb4ae]">
                        <span className="font-mono text-[#38bb92]">0{i+1}</span>{item}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="surface p-4 sm:p-5">
                  <SectionHeader icon={ArrowDownRight} eyebrow="Headwinds" title="Where it can perish"/>
                  <div className="mt-3 space-y-2">
                    {['No validated repeat rate or willingness to pay.','An incumbent can copy the visible offer quickly.','Acquisition cost may outrun cash contribution per customer.'].map((item,i)=>(
                      <div key={item} className="flex gap-2.5 border-t border-[#1c2a2f] pt-2 text-[10px] leading-4 text-[#9fb4ae]">
                        <span className="font-mono text-[#df8174]">0{i+1}</span>{item}
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* Rivals Arena Table & Positioning Constellation Scatter Chart */}
              <section id="rivals" className="surface p-4 sm:p-6">
                <SectionHeader icon={Swords} eyebrow="Threat landscape" title="The rivals arena" note="Sample scenario"/>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[580px] text-left">
                    <thead>
                      <tr className="font-mono text-[8px] uppercase tracking-[.1em] text-[#536c70]">
                        {['Alternative','What it offers','Price signal','Threat','Possible gap'].map(x=><th key={x} className="border-b border-[#223339] px-2.5 py-2 font-normal">{x}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['Do nothing','Current habit / status quo','Free','High','No switching cost'],
                        ['Local substitute','Neighborhood provider','Variable','Medium','Trust & proximity'],
                        ['Scaled platform','Convenience / breadth','Low–mid','High','Local service depth'],
                      ].map(row=>(
                        <tr key={row[0]} className="text-[10px] text-[#9bb0ad]">
                          {row.map((cell,i)=>(
                            <td key={cell} className="border-b border-[#1a292e] px-2.5 py-2">
                              {i===3?<span className={`border px-1.5 py-0.5 font-mono text-[7px] ${cell==='High'?'border-[#653a34] text-[#e88779]':'border-[#67572a] text-[#d7b55a]'}`}>{cell}</span>:cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 2D Positioning Constellation Scatter Matrix */}
                <div className="mt-4 border border-[#1e3237] bg-[#080f12] p-3.5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-[7px] uppercase tracking-[.1em] text-[#6b8582]">Positioning constellation · illustrative</span>
                    <span className="font-mono text-[7px] text-[#53696e]">PRICE → / DOMINANCE ↑</span>
                  </div>
                  <div className="relative h-[170px] border-b border-l border-[#26393c] bg-[linear-gradient(rgba(120,146,158,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(120,146,158,.06)_1px,transparent_1px)] bg-[size:25%_25%]">
                    <span className="absolute left-[14%] top-[50%] h-2.5 w-2.5 rounded-full border border-[#cc9ee9] bg-[#a855f7] shadow-[0_0_12px_#a855f7]"/>
                    <span className="absolute left-[56%] top-[24%] h-2.5 w-2.5 rounded-full border border-[#66b6d4] bg-[#458bab]"/>
                    <span className="absolute left-[74%] top-[35%] h-2.5 w-2.5 rounded-full border border-[#66b6d4] bg-[#458bab]"/>
                    <span className="absolute left-[41%] top-[63%] flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#12b695] shadow-[0_0_16px_#14b8a6]">
                      <span className="h-1 w-1 rounded-full bg-white"/>
                    </span>
                    <span className="absolute left-[7%] top-[54%] font-mono text-[7px] text-[#a681c8]">local alternatives</span>
                    <span className="absolute left-[46%] top-[67%] font-mono text-[7px] text-[#5ec7ac]">your venture*</span>
                    <span className="absolute right-[4%] top-[25%] font-mono text-[7px] text-[#718d98]">scaled platform</span>
                  </div>
                  <p className="mt-1.5 text-[8px] text-[#51686d]">*Position is illustrative. Competitor identities are demo placeholders.</p>
                </div>
              </section>

              {/* Market Domain TAM/SAM/SOM Rings */}
              <section id="market" className="grid gap-4 md:grid-cols-[.9fr_1.1fr]">
                <div className="surface p-4 sm:p-5">
                  <SectionHeader icon={Activity} eyebrow="Market domain" title="Market sizing"/>
                  <div className="mt-4 flex items-center justify-around gap-2">
                    {[['TAM','₹—'],['SAM','₹—'],['SOM','₹—']].map(([a,b],i)=>(
                      <div key={a} className="flex h-[80px] w-[80px] flex-col items-center justify-center rounded-full border text-center" style={{borderColor:['#1f7667','#24596a','#43305a'][i],background:['#0d231f','#0c1b20','#171120'][i]}}>
                        <span className="font-mono text-[7px] text-[#77908d]">{a}</span>
                        <span className="mt-0.5 text-xs text-[#bbcbc7]">{b}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[8px] leading-4 text-[#61777a]">No fabricated TAM numbers. Define segment and credible spend before sizing.</p>
                </div>

                <div className="surface p-4 sm:p-5">
                  <SectionHeader icon={Users} eyebrow="Target soul" title="The customer behind the data"/>
                  <div className="mt-3 border-t border-[#223236] pt-3">
                    <span className="font-mono text-[7px] uppercase tracking-[.12em] text-[#61847b]">First hypothesis</span>
                    <p className="mt-1 text-xs leading-5 text-[#a5b8b2]">A reachable early customer whose pain is frequent enough to change a daily routine.</p>
                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                      <div className="border border-[#1f3134] bg-[#091113] p-2.5">
                        <span className="font-mono text-[7px] text-[#58716e]">WILLINGNESS TO PAY</span>
                        <p className="mt-0.5 text-[9px] text-[#98afaa]">Test with real transaction</p>
                      </div>
                      <div className="border border-[#1f3134] bg-[#091113] p-2.5">
                        <span className="font-mono text-[7px] text-[#58716e]">PAIN FREQUENCY</span>
                        <p className="mt-0.5 text-[9px] text-[#98afaa]">Ask for a recent example</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* 24-Month Alchemical Reactive Cash Sandbox */}
              <section id="sandbox" className="surface overflow-hidden p-4 sm:p-6">
                <SectionHeader icon={TrendingDown} eyebrow="Interactive Financial Engine" title="24-Month Alchemical Reactive Sandbox" note="Calculates live client-side"/>
                <div className="mt-4 grid gap-5 xl:grid-cols-[280px_1fr]">
                  <div className="border border-[#1e3237] bg-[#081013] p-3.5">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="font-mono text-[8px] uppercase tracking-[.1em] text-[#7a908c]">Change the levers</span>
                      <Zap size={13} className="text-[#19b99a]"/>
                    </div>
                    <LeverRow label="Monthly price" value={lever.price} min={500} max={7000} step={100} display={`₹${lever.price.toLocaleString('en-IN')}`} onChange={price=>setLever({...lever,price})}/>
                    <LeverRow label="New customers / month" value={lever.souls} min={10} max={240} step={5} display={`${lever.souls}`} onChange={souls=>setLever({...lever,souls})}/>
                    <LeverRow label="Monthly churn" value={lever.churn} min={1} max={14} step={0.5} display={`${lever.churn.toFixed(1)}%`} onChange={churn=>setLever({...lever,churn})}/>
                    <LeverRow label="Monthly fixed burn" value={lever.burn/1000} min={40} max={500} step={10} display={`₹${(lever.burn/100000).toFixed(1)}L`} onChange={burn=>setLever({...lever,burn:burn*1000})}/>
                    <LeverRow label="Acquisition cost / customer" value={lever.cac} min={200} max={6000} step={100} display={`₹${lever.cac.toLocaleString('en-IN')}`} onChange={cac=>setLever({...lever,cac})}/>
                    <LeverRow label="EMI / distribution partners" value={lever.partners} min={0} max={8} step={1} display={`${lever.partners}`} onChange={partners=>setLever({...lever,partners})}/>
                    <button data-testid="button-reset-sandbox" onClick={()=>setLever({price:2500,souls:65,churn:4.5,burn:150000,cac:1200,partners:2})} className="button-quiet mt-3 flex w-full items-center justify-center gap-1.5 py-1.5 text-[8px]">
                      <RotateCcw size={11}/><span>Reset baseline</span>
                    </button>
                  </div>

                  <div className="min-w-0">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        ['Break-even',projections.base.breakEven?`Month ${projections.base.breakEven}`:'Beyond 24 mo'],
                        ['24 mo cash',formatMoney(projections.base.cash)],
                        ['24 mo ROI',`${projections.base.roi.toFixed(0)}%`],
                        ['LTV : CAC',`${projections.ltvCac.toFixed(1)}×`],
                      ].map(([label,value],i)=>(
                        <div key={label} className="border border-[#203338] bg-[#081114] p-2.5">
                          <span className="font-mono text-[7px] uppercase tracking-[.08em] text-[#58716f]">{label}</span>
                          <p className="font-display mt-1 text-base font-bold" style={{color:i===3&&projections.ltvCac>=3?'#25c997':i===3&&projections.ltvCac<1?'#ed7870':'#c8d8d2'}}>{value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3.5 border border-[#1e3237] bg-[#081013] p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-[8px] uppercase tracking-[.1em] text-[#78908b]">Cumulative cash / 24 months</span>
                        <div className="flex gap-2.5 font-mono text-[7px]">
                          <span className="text-[#d1846f]">— cautious</span>
                          <span className="text-[#19b99a]">— baseline</span>
                          <span className="text-[#74a9cb]">— optimistic</span>
                        </div>
                      </div>
                      <div className="mt-3 h-[200px] w-full overflow-hidden">
                        <svg viewBox="0 0 600 220" preserveAspectRatio="none" className="h-full w-full">
                          <g className="chart-grid">
                            <line x1="0" y1="45" x2="600" y2="45"/>
                            <line x1="0" y1="110" x2="600" y2="110"/>
                            <line x1="0" y1="175" x2="600" y2="175"/>
                          </g>
                          <path d={pathFor(projections.cautious.points)} fill="none" stroke="#ce806c" strokeWidth="2" strokeDasharray="5 5"/>
                          <path d={pathFor(projections.bright.points)} fill="none" stroke="#689fc3" strokeWidth="2" strokeDasharray="5 5"/>
                          <path d={pathFor(projections.base.points)} fill="none" stroke="#18bd9e" strokeWidth="3"/>
                          <text x="2" y="42" fill="#52696b" fontSize="8" fontFamily="IBM Plex Mono">+₹</text>
                          <text x="2" y="114" fill="#52696b" fontSize="8" fontFamily="IBM Plex Mono">0</text>
                          <text x="2" y="179" fill="#52696b" fontSize="8" fontFamily="IBM Plex Mono">−₹</text>
                          <text x="15" y="210" fill="#52696b" fontSize="8" fontFamily="IBM Plex Mono">MONTH 0</text>
                          <text x="539" y="210" fill="#52696b" fontSize="8" fontFamily="IBM Plex Mono">MONTH 24</text>
                        </svg>
                      </div>
                      <div className="mt-1.5 flex justify-between text-[8px] text-[#536b6e]">
                        <span>Starting cash: −₹8.0L setup assumption</span>
                        <span>Data: live recalculating</span>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {[
                        ['Cautious',projections.cautious.cash,'#d1846f'],
                        ['Baseline',projections.base.cash,'#19b99a'],
                        ['Optimistic',projections.bright.cash,'#74a9cb'],
                      ].map(([name,cash,col])=>(
                        <div key={name} className="flex items-center justify-between border border-[#1d3035] bg-[#091214] px-2.5 py-1.5">
                          <span className="font-mono text-[8px]" style={{color:col as string}}>{name}</span>
                          <span className="font-mono text-[9px] text-[#9bb2ac]">{formatMoney(cash as number)} ending cash</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Signature Ritual for Current Stage */}
              <section id="rituals" className="surface p-4 sm:p-5">
                <SectionHeader icon={WandSparkles} eyebrow={`${stage} signature protocol`} title={stage==='Launch'?'The pre-mortem':stage==='Grow'?'The red-team moat check':stage==='Rescue'?'The one urgent ritual':'Digital autopsy & relic inventory'} note="Operational direction"/>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="border border-[#263438] bg-[#091214] p-3.5">
                    <div className="font-mono text-[7px] uppercase tracking-[.1em] text-[#18b99b]">Failure vulnerability</div>
                    <p className="mt-2 text-[11px] leading-5 text-[#9bb1ab]">
                      {stage==='Launch'?'Twelve months from now, the team built ahead of evidence. A curious first wave never returned while fixed burn accumulated.'
                        :stage==='Grow'?'A well-funded entrant bundles the visible feature and customers churn. The moat was assumed rather than earned.'
                        :stage==='Rescue'?'Discounts bought visits but erased contribution margin. Cash ran out before the team understood root churn causes.'
                        :'The founder revived the old operating model, but the market had shifted. The brand remained; the economics did not.'}
                    </p>
                  </div>

                  <div className="border border-[#263438] bg-[#091214] p-3.5">
                    <div className="font-mono text-[7px] uppercase tracking-[.1em] text-[#c39ae2]">Survival protocol</div>
                    <ul className="mt-2 space-y-1.5 text-[10px] leading-5 text-[#96aaa6]">
                      {['Name one customer segment and one measurable outcome.','Run the smallest pilot test that could disprove the core belief.','Set a strict loss limit and a decision deadline before spending.'].map(item=>(
                        <li key={item} className="flex gap-2">
                          <Check size={12} className="mt-0.5 shrink-0 text-[#18b99b]"/>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </section>
      )}

      {/* Floating Bottom Capsule / Bubble Navigation Dock ("bubble thingy") */}
      <FooterDock
        screen={screen}
        stage={stage}
        stageColor={stageColor}
        onSetScreen={(s) => { setScreen(s); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
      />
    </main>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/compare" component={Compare} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
