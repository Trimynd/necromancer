import type { LucideIcon } from 'lucide-react';

export type Stage = 'Launch' | 'Grow' | 'Rescue' | 'Revive';

export type Screen = 0 | 1 | 2 | 3 | 4 | 5;

export interface Demo {
  title: string;
  stage: Stage;
  pitch: string;
  short: string;
  score: number;
  verdict: string;
  subtitle: string;
}

export interface ModeItem {
  name: Stage;
  label: string;
  desc: string;
  color: string;
  icon: LucideIcon;
}

export interface LeverState {
  price: number;
  souls: number;
  churn: number;
  burn: number;
  cac: number;
  partners: number;
}

export interface ScenarioResult {
  points: number[];
  cash: number;
  breakEven: number | null;
  roi: number;
}

export interface Projections {
  base: ScenarioResult;
  cautious: ScenarioResult;
  bright: ScenarioResult;
  ltvCac: number;
  ltv: number;
  margin: number;
}
