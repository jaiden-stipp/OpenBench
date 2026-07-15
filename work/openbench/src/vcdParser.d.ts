export type VcdChange = [number, string];
export type VcdSignal = {
  key: string;
  id: string;
  type: string;
  width: number;
  name: string;
  path: string;
  scope: string;
  changes: VcdChange[];
};
export type VcdData = { timescale: string; endTime: number; timestampCount: number; signals: VcdSignal[] };
export function parseVcd(text: string): VcdData;
export function valueAt(changes: VcdChange[], time: number): string;
export function formatVcdValue(value: string, width: number, radix: 'bin' | 'hex' | 'dec'): string;
