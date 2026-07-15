export function firstVisibleChange(changes, time) {
  let low = 0;
  let high = changes.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (changes[middle][0] < time) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}

export function sampleVisibleChanges(changes, viewStart, viewEnd, pixelWidth) {
  if (!changes.length || pixelWidth <= 0) return [];
  const span = Math.max(1, viewEnd - viewStart);
  const sampled = [];
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
