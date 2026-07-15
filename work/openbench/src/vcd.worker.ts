import { parseVcd } from './vcdParser.js';

self.onmessage = (event: MessageEvent<{ name: string; content: string }>) => {
  try {
    const data = parseVcd(event.data.content);
    self.postMessage({ ok: true, name: event.data.name, data });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
