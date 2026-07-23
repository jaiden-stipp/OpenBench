import { useMemo, useState } from 'react';
import { parseDiagnostic } from '../diagnostics.js';
import type { ConsoleMode } from '../types/ui';
import { visibleConsoleEntries } from '../consoleEntries';

interface OutputConsoleProps {
  mode: ConsoleMode;
  text: string;
  onClear: () => void;
  onOpenSource: (path: string, line: number, column: number) => void;
}

type Diagnostic = ReturnType<typeof parseDiagnostic>;

function presentationFor(line: string, diagnostic: Diagnostic) {
  if (line.includes('TIP:')) return { kind: 'translation', label: 'INFO' };
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
  const visible = visibleConsoleEntries(entries, showRaw);
  const outcome = consoleOutcome(mode, text);

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
        {outcome && <div className={`console-outcome ${outcome.kind}`}>{outcome.label}</div>}
        {primary.length === 0 && raw.length > 0 && !showRaw && (
          <div className="console-placeholder">Tool output is available under “Show raw.”</div>
        )}
        {visible.map(({ line, diagnostic, presentation }, index) => {
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

function consoleOutcome(mode: ConsoleMode, text: string) {
  if (mode === 'compile') {
    if (/Compile failed/i.test(text)) return { kind: 'failed', label: 'Compile failed' };
    if (/Compile succeeded/i.test(text))
      return {
        kind: 'succeeded',
        label: /\b(?:warning|sorry):?/i.test(text)
          ? 'Compile succeeded with warnings'
          : 'Compile succeeded',
      };
  }
  if (mode === 'simulation' && /Simulation (?:completed|succeeded)/i.test(text))
    return { kind: 'succeeded', label: 'Simulation completed' };
  return null;
}

function prepareConsoleEntries(text: string) {
  const seenTranslations = new Set<string>();
  let previousLine = '';
  return text
    .replaceAll('\r\n', '\n')
    .split('\n')
    .flatMap((line) => {
      const diagnostic = parseDiagnostic(line);
      const presentation =
        line && line === previousLine
          ? { kind: 'raw', label: '' }
          : presentationFor(line, diagnostic);
      previousLine = line;
      if (presentation.kind === 'translation') {
        const normalized = line.trim();
        if (seenTranslations.has(normalized)) return [];
        seenTranslations.add(normalized);
      }
      if (!line && !diagnostic) return [];
      return [{ line, diagnostic, presentation }];
    });
}
