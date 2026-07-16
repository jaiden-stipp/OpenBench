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
