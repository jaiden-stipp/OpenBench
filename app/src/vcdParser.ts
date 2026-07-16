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
export type VcdData = {
  timescale: string;
  endTime: number;
  timestampCount: number;
  signals: VcdSignal[];
};

export function parseVcd(text: string): VcdData {
  const scopes: string[] = [];
  const signals: VcdSignal[] = [];
  const changesById = new Map<string, VcdChange[]>();
  let currentTime = 0;
  let endTime = 0;
  let timescale = '1ns';
  let timestampCount = 0;
  let inDefinitions = true;
  let offset = 0;

  while (offset <= text.length) {
    const nextNewline = text.indexOf('\n', offset);
    let start = offset;
    let end = nextNewline < 0 ? text.length : nextNewline;
    offset = nextNewline < 0 ? text.length + 1 : nextNewline + 1;
    while (start < end && isInlineWhitespace(text.charCodeAt(start))) start += 1;
    while (end > start && isInlineWhitespace(text.charCodeAt(end - 1))) end -= 1;
    const line = text.slice(start, end);
    if (!line) continue;
    if (inDefinitions) {
      if (line.startsWith('$scope ')) {
        const parts = line.split(/\s+/);
        scopes.push(parts[2]);
      } else if (line.startsWith('$upscope')) scopes.pop();
      else if (line.startsWith('$var ')) parseVariable(line, scopes, signals, changesById);
      else if (line.startsWith('$timescale')) {
        const parsed = parseTimescale(text, line, offset);
        timescale = parsed.timescale || timescale;
        offset = parsed.offset;
      } else if (line.startsWith('$enddefinitions')) inDefinitions = false;
      continue;
    }
    if (line[0] === '#') {
      currentTime = Number(line.slice(1));
      if (Number.isFinite(currentTime)) {
        endTime = Math.max(endTime, currentTime);
        timestampCount += 1;
      }
    } else if (line[0] !== '$') appendChange(line, currentTime, changesById);
  }
  return { timescale, endTime, timestampCount, signals };
}

function parseVariable(
  line: string,
  scopes: string[],
  signals: VcdSignal[],
  changesById: Map<string, VcdChange[]>,
) {
  const parts = line.split(/\s+/);
  const width = Number(parts[2]);
  const id = parts[3];
  const reference = parts.slice(4, parts.lastIndexOf('$end')).join(' ');
  const changes = changesById.get(id) || [];
  changesById.set(id, changes);
  signals.push({
    key: `${id}:${signals.length}`,
    id,
    type: parts[1],
    width: Number.isFinite(width) ? width : 1,
    name: reference,
    path: [...scopes, reference].join('.'),
    scope: scopes.join('.'),
    changes,
  });
}

function parseTimescale(text: string, line: string, initialOffset: number) {
  const inline = line.replace('$timescale', '').replace('$end', '').trim();
  if (inline) return { timescale: inline.replace(/\s+/g, ''), offset: initialOffset };
  let timescale = '';
  let offset = initialOffset;
  while (offset <= text.length) {
    const valueEnd = text.indexOf('\n', offset);
    const boundary = valueEnd < 0 ? text.length : valueEnd;
    let start = offset;
    let end = boundary;
    while (start < end && isInlineWhitespace(text.charCodeAt(start))) start += 1;
    while (end > start && isInlineWhitespace(text.charCodeAt(end - 1))) end -= 1;
    const value = text.slice(start, end);
    offset = valueEnd < 0 ? text.length + 1 : valueEnd + 1;
    if (value === '$end') break;
    if (value) timescale = value.replace(/\s+/g, '');
  }
  return { timescale, offset };
}

function appendChange(line: string, time: number, changesById: Map<string, VcdChange[]>) {
  if ('01xXzZ'.includes(line[0])) {
    changesById.get(line.slice(1))?.push([time, line[0].toLowerCase()]);
    return;
  }
  if ('bBrR'.includes(line[0])) {
    const separator = line.indexOf(' ');
    if (separator > 1)
      changesById
        .get(line.slice(separator + 1).trim())
        ?.push([time, line.slice(1, separator).toLowerCase()]);
  }
}

function isInlineWhitespace(code: number) {
  return code === 9 || code === 13 || code === 32;
}

export function valueAt(changes: VcdChange[], time: number): string {
  let low = 0;
  let high = changes.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (changes[middle][0] <= time) {
      found = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  return found >= 0 ? changes[found][1] : 'x';
}

export function formatVcdValue(value: string, width: number, radix: 'bin' | 'hex' | 'dec'): string {
  if (!/^[01xz]+$/i.test(value)) return value;
  const normalized =
    value.length === 1 && /[xz]/i.test(value)
      ? value.toLowerCase().repeat(Math.max(1, width))
      : value.toLowerCase().padStart(Math.max(1, width), '0');
  if (radix === 'bin') return normalized;
  if (/[xz]/.test(normalized)) {
    if (radix === 'dec') return normalized.includes('x') ? 'X' : 'Z';
    return `0x${bitsToUnknownAwareHex(normalized)}`;
  }
  const numeric = BigInt(`0b${normalized || '0'}`);
  if (radix === 'hex') return `0x${numeric.toString(16).padStart(Math.ceil(width / 4), '0')}`;
  return numeric.toString(10);
}

function bitsToUnknownAwareHex(bits: string) {
  const padded = bits.padStart(Math.ceil(bits.length / 4) * 4, '0');
  let result = '';
  for (let index = 0; index < padded.length; index += 4) {
    const nibble = padded.slice(index, index + 4);
    if (nibble.includes('x') || (nibble.includes('z') && !/^z+$/.test(nibble))) result += 'x';
    else if (/^z+$/.test(nibble)) result += 'z';
    else result += Number.parseInt(nibble, 2).toString(16);
  }
  return result;
}
