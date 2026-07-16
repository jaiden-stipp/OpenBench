import { parseVcd } from './vcdParser.js';

self.onmessage = (
  event: MessageEvent<{
    name: string;
    content: string;
    purpose?: 'history';
    id?: string;
    createdAt?: number;
  }>,
) => {
  try {
    const data = parseVcd(event.data.content);
    self.postMessage({
      ok: true,
      name: event.data.name,
      data,
      purpose: event.data.purpose,
      id: event.data.id,
      createdAt: event.data.createdAt,
    });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      purpose: event.data.purpose,
      id: event.data.id,
    });
  }
};
