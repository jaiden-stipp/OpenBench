import type { VcdChange } from './vcdParser.js';
export function firstVisibleChange(changes: VcdChange[], time: number): number;
export function sampleVisibleChanges(
  changes: VcdChange[],
  viewStart: number,
  viewEnd: number,
  pixelWidth: number,
): VcdChange[];
