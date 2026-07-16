import type { VcdChange } from './vcdParser.js';

export function lowerBoundChange(changes: VcdChange[], time: number): number {
  let low = 0;
  let high = changes.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (changes[middle][0] < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function firstVisibleChange(changes: VcdChange[], time: number): number {
  return Math.max(0, lowerBoundChange(changes, time) - 1);
}

export function hasChangeInRange(changes: VcdChange[], start: number, end: number): boolean {
  const index = lowerBoundChange(changes, start);
  return index < changes.length && changes[index][0] <= end;
}

export function adjacentTransitionTime(
  changes: VcdChange[],
  time: number,
  direction: -1 | 1,
): number | undefined {
  const index = lowerBoundChange(changes, time);
  if (direction > 0) {
    const next = index < changes.length && changes[index][0] === time ? index + 1 : index;
    return changes[next]?.[0];
  }
  return changes[index - 1]?.[0];
}

export function sampleVisibleChanges(
  changes: VcdChange[],
  viewStart: number,
  viewEnd: number,
  pixelWidth: number,
): VcdChange[] {
  if (!changes.length || pixelWidth <= 0) return [];
  const span = Math.max(1, viewEnd - viewStart);
  const sampled: VcdChange[] = [];
  let index = firstVisibleChange(changes, viewStart);
  let lastPixel = -1;
  while (index < changes.length) {
    const change = changes[index];
    if (change[0] > viewEnd) break;
    const pixel = Math.max(
      0,
      Math.min(
        pixelWidth,
        Math.floor(((Math.max(change[0], viewStart) - viewStart) / span) * pixelWidth),
      ),
    );
    if (pixel === lastPixel) sampled[sampled.length - 1] = change;
    else {
      sampled.push(change);
      lastPixel = pixel;
    }
    index += 1;
  }
  return sampled;
}

const TIME_UNITS = [
  ['s', 1],
  ['ms', 1e-3],
  ['us', 1e-6],
  ['ns', 1e-9],
  ['ps', 1e-12],
  ['fs', 1e-15],
] as const;

export function formatSimulationTime(ticks: number, timescale: string): string {
  const match = timescale.match(/([\d.]+)\s*(s|ms|us|ns|ps|fs)/i);
  if (!match) return `${Math.round(ticks)} ticks`;
  const base = TIME_UNITS.find(([unit]) => unit === match[2].toLowerCase());
  if (!base) return `${Math.round(ticks)} ticks`;
  if (ticks === 0) return `0 ${base[0]}`;
  const seconds = ticks * Number(match[1]) * base[1];
  const absolute = Math.abs(seconds);
  const display =
    TIME_UNITS.find(([, multiplier]) => absolute >= multiplier) ||
    TIME_UNITS[TIME_UNITS.length - 1];
  const value = seconds / display[1];
  const precision = Math.abs(value) >= 100 ? 1 : Math.abs(value) >= 10 ? 3 : 4;
  return `${Number(value.toFixed(precision))} ${display[0]}`;
}
