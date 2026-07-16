import type { VcdData, VcdSignal } from './vcdParser.js';
import { formatVcdValue } from './vcdParser.js';
import { sampleVisibleChanges } from './waveformMath.js';

export const ROW_HEIGHT = 30;
export const HEADER_HEIGHT = 30;

type RenderSignal = {
  signal: VcdSignal;
  radix: 'bin' | 'hex' | 'dec';
};

type RenderOptions = {
  canvas: HTMLCanvasElement;
  signals: RenderSignal[];
  data: VcdData;
  viewStart: number;
  viewEnd: number;
  cursor: number;
  cursorB: number | null;
  bookmarks: Array<{ time: number; label: string }>;
  theme: 'dark' | 'light';
  displayOptions: { highContrast: boolean; largeText: boolean };
  viewportHeight: number;
  rowOffset: number;
};

export function drawWaveforms(options: RenderOptions) {
  const prepared = prepareCanvas(options);
  if (!prepared) return;
  const { context, width, height, light, xForTime } = prepared;
  drawTimelineGrid(context, options, width, height, light, xForTime);
  drawSignalRows(context, options, width, light, xForTime);
  drawCursor(context, options.cursor, '#ffcb6b', '', width, height, xForTime);
  if (options.cursorB !== null)
    drawCursor(context, options.cursorB, '#62a8ff', 'B ', width, height, xForTime);
  drawBookmarks(context, options.bookmarks, width, xForTime);
}

function prepareCanvas(options: RenderOptions) {
  const { canvas, theme, viewStart, viewEnd, viewportHeight } = options;
  const width = canvas.clientWidth;
  const height = Math.max(HEADER_HEIGHT + ROW_HEIGHT, viewportHeight);
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.height = `${height}px`;
  }
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  const light = theme === 'light';
  context.fillStyle = light ? '#f7f9fc' : '#0a0f15';
  context.fillRect(0, 0, width, height);
  const span = Math.max(1, viewEnd - viewStart);
  return {
    context,
    width,
    height,
    light,
    xForTime: (time: number) => ((time - viewStart) / span) * width,
  };
}

function drawTimelineGrid(
  context: CanvasRenderingContext2D,
  options: RenderOptions,
  width: number,
  height: number,
  light: boolean,
  xForTime: (time: number) => number,
) {
  context.font = `${options.displayOptions.largeText ? 12 : 10}px 'Cascadia Code', Consolas, monospace`;
  context.textBaseline = 'middle';
  for (let grid = 0; grid <= 10; grid += 1) {
    const x = (grid / 10) * width;
    const time = Math.round(
      options.viewStart + (grid / 10) * (options.viewEnd - options.viewStart),
    );
    context.strokeStyle =
      grid % 5 === 0
        ? light
          ? '#bdc9d8'
          : options.displayOptions.highContrast
            ? '#5f7895'
            : '#263449'
        : light
          ? '#e1e7ef'
          : options.displayOptions.highContrast
            ? '#31465d'
            : '#182331';
    context.beginPath();
    context.moveTo(x + 0.5, HEADER_HEIGHT);
    context.lineTo(x + 0.5, height);
    context.stroke();
    context.fillStyle = light ? '#52657a' : '#7f93aa';
    context.fillText(`${time}`, Math.min(width - 56, x + 4), 14);
  }
  context.fillStyle = light ? '#6b7c91' : '#52657a';
  context.fillText(options.data.timescale, 5, 26);
  void xForTime;
}

function drawSignalRows(
  context: CanvasRenderingContext2D,
  options: RenderOptions,
  width: number,
  light: boolean,
  xForTime: (time: number) => number,
) {
  options.signals.forEach(({ signal, radix }, row) => {
    const top = HEADER_HEIGHT + row * ROW_HEIGHT;
    const center = top + ROW_HEIGHT / 2;
    context.fillStyle =
      (row + options.rowOffset) % 2
        ? light
          ? '#f1f5f9'
          : '#0d141d'
        : light
          ? '#fafcff'
          : '#0a1017';
    context.fillRect(0, top, width, ROW_HEIGHT);
    const changes = sampleVisibleChanges(
      signal.changes,
      options.viewStart,
      options.viewEnd,
      Math.max(1, Math.floor(width)),
    );
    if (!changes.length) return;
    context.strokeStyle =
      signal.width === 1
        ? light
          ? '#087f68'
          : options.displayOptions.highContrast
            ? '#75f7d4'
            : '#55d8b7'
        : light
          ? '#1769aa'
          : options.displayOptions.highContrast
            ? '#8fc4ff'
            : '#62a8ff';
    context.fillStyle = light ? '#155b96' : '#9bc8ff';
    context.lineWidth = 1.25;
    context.beginPath();
    changes.forEach(([time, rawValue], index) => {
      if (time > options.viewEnd) return;
      const nextTime = changes[index + 1]?.[0] ?? options.viewEnd;
      const x = Math.max(0, xForTime(Math.max(time, options.viewStart)));
      const nextX = Math.min(width, xForTime(Math.min(nextTime, options.viewEnd)));
      if (signal.width === 1) drawBitSegment(context, rawValue, index, x, nextX, top, center);
      else drawBusSegment(context, rawValue, signal.width, radix, index, x, nextX, center);
    });
    context.stroke();
  });
}

function drawBitSegment(
  context: CanvasRenderingContext2D,
  value: string,
  index: number,
  x: number,
  nextX: number,
  top: number,
  center: number,
) {
  const normalized = value.toLowerCase();
  const y = normalized === '1' ? top + 6 : normalized === '0' ? top + ROW_HEIGHT - 6 : center;
  if (index > 0) context.lineTo(x, y);
  else context.moveTo(x, y);
  context.lineTo(nextX, y);
}

function drawBusSegment(
  context: CanvasRenderingContext2D,
  value: string,
  width: number,
  radix: RenderSignal['radix'],
  index: number,
  x: number,
  nextX: number,
  center: number,
) {
  context.moveTo(x, center);
  context.lineTo(nextX, center);
  if (index > 0) {
    context.moveTo(x - 3, center - 6);
    context.lineTo(x + 3, center + 6);
    context.moveTo(x - 3, center + 6);
    context.lineTo(x + 3, center - 6);
  }
  if (nextX - x > 42) {
    const label = formatVcdValue(value, width, radix);
    context.fillText(label.length > 14 ? `${label.slice(0, 13)}…` : label, x + 6, center - 8);
  }
}

function drawCursor(
  context: CanvasRenderingContext2D,
  time: number,
  color: string,
  prefix: string,
  width: number,
  height: number,
  xForTime: (time: number) => number,
) {
  const x = xForTime(time);
  if (x < 0 || x > width) return;
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(x + 0.5, 0);
  context.lineTo(x + 0.5, height);
  context.stroke();
  context.fillStyle = color;
  context.fillRect(Math.min(x + 4, width - 70), 3, 66, 18);
  context.fillStyle = prefix ? '#081522' : '#17120a';
  context.fillText(`${prefix}${Math.round(time)}`, Math.min(x + 8, width - 66), 12);
}

function drawBookmarks(
  context: CanvasRenderingContext2D,
  bookmarks: RenderOptions['bookmarks'],
  width: number,
  xForTime: (time: number) => number,
) {
  for (const bookmark of bookmarks) {
    const x = xForTime(bookmark.time);
    if (x < 0 || x > width) continue;
    context.fillStyle = '#c792ea';
    context.beginPath();
    context.moveTo(x - 5, HEADER_HEIGHT);
    context.lineTo(x + 5, HEADER_HEIGHT);
    context.lineTo(x, HEADER_HEIGHT + 7);
    context.closePath();
    context.fill();
  }
}
