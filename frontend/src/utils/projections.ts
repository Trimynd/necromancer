import type { LeverState, Projections } from '../types/necromancer';

export function calculateProjections(lever: LeverState): Projections {
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

  return {
    base: scenario(1),
    cautious: scenario(0.5),
    bright: scenario(1.5),
    ltvCac,
    ltv,
    margin,
  };
}

export function formatMoney(n: number): string {
  return `${n < 0 ? '−' : ''}₹${Math.abs(n / 100000).toFixed(1)}L`;
}

export function pathFor(points: number[], width = 600, height = 220): string {
  const min = Math.min(-200000, ...points);
  const max = Math.max(300000, ...points);
  const span = max - min || 1;
  return points
    .map(
      (point, i) =>
        `${i ? 'L' : 'M'} ${(i / (points.length - 1)) * width},${
          height - ((point - min) / span) * (height - 20)
        }`
    )
    .join(' ');
}
