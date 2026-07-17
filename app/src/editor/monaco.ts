import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

type MonacoWorkerEnvironment = typeof globalThis & {
  MonacoEnvironment: { getWorker: (_moduleId: string, _label: string) => Worker };
};

(globalThis as MonacoWorkerEnvironment).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

export { monaco };
