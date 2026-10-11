import { Sparkles, TrendingUp, HeartPulse, Skull } from 'lucide-react';
import type { ModeItem } from '../types/necromancer';

export const MODES: ModeItem[] = [
  {
    name: 'Launch',
    label: 'Genesis ritual',
    desc: 'An idea waiting for its first proof.',
    color: '#10b981',
    icon: Sparkles,
  },
  {
    name: 'Grow',
    label: 'Blood pact',
    desc: 'A living company reaching for more.',
    color: '#3b82f6',
    icon: TrendingUp,
  },
  {
    name: 'Rescue',
    label: 'Emergency exorcism',
    desc: 'A business with life-force running low.',
    color: '#f59e0b',
    icon: HeartPulse,
  },
  {
    name: 'Revive',
    label: 'Digital necromancy',
    desc: 'A fallen company with something left behind.',
    color: '#a855f7',
    icon: Skull,
  },
];
