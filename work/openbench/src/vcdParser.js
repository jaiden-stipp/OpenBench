export function parseVcd(text) {
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  const scopes = [];
  const signals = [];
  const changesById = new Map();
  let currentTime = 0;
  let endTime = 0;
  let timescale = '1ns';
  let timestampCount = 0;
  let inDefinitions = true;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    if (inDefinitions) {
      if (line.startsWith('$scope ')) {
        const parts = line.split(/\s+/);
        scopes.push(parts[2]);
      } else if (line.startsWith('$upscope')) {
        scopes.pop();
      } else if (line.startsWith('$var ')) {
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
      } else if (line.startsWith('$timescale')) {
        const inline = line.replace('$timescale', '').replace('$end', '').trim();
        if (inline) timescale = inline.replace(/\s+/g, '');
        else {
          while (++index < lines.length) {
            const value = lines[index].trim();
            if (value === '$end') break;
            if (value) timescale = value.replace(/\s+/g, '');
          }
        }
      } else if (line.startsWith('$enddefinitions')) {
        inDefinitions = false;
      }
      continue;
    }

    if (line[0] === '#') {
      currentTime = Number(line.slice(1));
      if (Number.isFinite(currentTime)) {
        endTime = Math.max(endTime, currentTime);
        timestampCount += 1;
      }
      continue;
    }
    if (line[0] === '$') continue;
    if ('01xXzZ'.includes(line[0])) {
      const changes = changesById.get(line.slice(1));
      if (changes) changes.push([currentTime, line[0].toLowerCase()]);
      continue;
    }
    if ('bBrR'.includes(line[0])) {
      const separator = line.indexOf(' ');
      if (separator > 1) {
        const changes = changesById.get(line.slice(separator + 1).trim());
        if (changes) changes.push([currentTime, line.slice(1, separator).toLowerCase()]);
      }
    }
  }

  return { timescale, endTime, timestampCount, signals };
}

export function valueAt(changes, time) {
  let low = 0;
  let high = changes.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (changes[middle][0] <= time) { found = middle; low = middle + 1; }
    else high = middle - 1;
  }
  return found >= 0 ? changes[found][1] : 'x';
}

export function formatVcdValue(value, width, radix) {
  if (!/^[01xz]+$/i.test(value)) return value;
  if (radix === 'bin' || /[xz]/i.test(value)) return width > 1 ? value.padStart(width, '0') : value;
  const numeric = BigInt(`0b${value || '0'}`);
  if (radix === 'hex') return `0x${numeric.toString(16).padStart(Math.ceil(width / 4), '0')}`;
  return numeric.toString(10);
}
