import { useMemo, useState } from 'react';
import { parseDiagnostic } from '../diagnostics.js';
import type { ConsoleMode } from '../types/ui';

interface OutputConsoleProps {
  mode: ConsoleMode;
  text: string;
  onClear: () => void;
  onOpenSource: (path: string, line: number, column: number) => void;
}

type Diagnostic = ReturnType<typeof parseDiagnostic>;

function presentationFor(line: string, diagnostic: Diagnostic) {
  if (line.includes('💡')) return { kind: 'translation', label: 'INFO' };
  if (diagnostic) return { kind: 'diagnostic', label: 'OPEN' };
  if (line.startsWith('$ ')) return { kind: 'command', label: 'COMMAND' };
  if (
    /^(?:Checking|Running|Building|Compile|Simulation|RTL schematic|Opened|Created editable)/.test(
      line,
    )
  ) {
    return { kind: 'summary', label: '' };
  }
  if (/\b(?:warning|error|fatal|sorry:)\b/i.test(line)) return { kind: 'warning', label: 'TOOL' };
  return { kind: 'raw', label: '' };
}

function titleFor(mode: ConsoleMode) {
  if (mode === 'compile') return 'COMPILE OUTPUT';
  if (mode === 'simulation') return 'SIMULATION OUTPUT';
  return 'YOSYS OUTPUT';
}

export default function OutputConsole({ mode, text, onClear, onOpenSource }: OutputConsoleProps) {
  const [showRaw, setShowRaw] = useState(false);
  const entries = useMemo(() => prepareConsoleEntries(text), [text]);
  const primary = entries.filter(
    (entry) => entry.presentation.kind !== 'raw' && entry.presentation.kind !== 'command',
  );
  const raw = entries.filter(
    (entry) => entry.presentation.kind === 'raw' || entry.presentation.kind === 'command',
  );

  return (
    <div className="console-panel panel" style={{ gridArea: 'console' }}>
      <div className="panel-title">
        <span>{titleFor(mode)}</span>
        <div>
          {raw.length > 0 && (
            <button onClick={() => setShowRaw((value) => !value)}>
              {showRaw ? 'Hide' : 'Show'} raw ({raw.length})
            </button>
          )}
          <button onClick={onClear}>Clear</button>
        </div>
      </div>
      <div className="console" role="log">
        {primary.length === 0 && raw.length > 0 && !showRaw && (
          <div className="console-placeholder">Tool output is available under “Show raw.”</div>
        )}
        {[...primary, ...(showRaw ? raw : [])].map(({ line, diagnostic, presentation }, index) => {
          const className = [
            'console-line',
            presentation.kind,
            presentation.kind === 'translation' ? 'translated' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const body = (
            <>
              <span className="console-kind">{line ? presentation.label : ''}</span>
              <span className="console-message">{line || ' '}</span>
            </>
          );

          if (diagnostic) {
            return (
              <button
                key={`${index}-${line}`}
                className={className}
                title="Open source location"
                onClick={() => onOpenSource(diagnostic.path, diagnostic.line, diagnostic.column)}
              >
                {body}
              </button>
            );
          }

          return (
            <div key={`${index}-${line}`} className={className}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function prepareConsoleEntries(text: string) {
  const seenTranslations = new Set<string>();
  return text
    .replaceAll('\r\n', '\n')
    .split('\n')
    .flatMap((line) => {
      const diagnostic = parseDiagnostic(line);
      const presentation = presentationFor(line, diagnostic);
      if (presentation.kind === 'translation') {
        const normalized = line.trim();
        if (seenTranslations.has(normalized)) return [];
        seenTranslations.add(normalized);
      }
      if (!line && !diagnostic) return [];
      return [{ line, diagnostic, presentation }];
    });
}
