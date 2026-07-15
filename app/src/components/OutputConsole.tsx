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
  if (line.includes('💡')) return { kind: 'translation', label: 'EXPLAIN' };
  if (diagnostic) return { kind: 'diagnostic', label: 'SOURCE' };
  if (line.startsWith('$ ')) return { kind: 'command', label: 'RUN' };
  if (
    /^(?:Starting|Compile finished|Simulation finished|Yosys finished|Opened|Created editable)/.test(
      line,
    )
  ) {
    return { kind: 'summary', label: 'STATUS' };
  }
  if (/\b(?:warning|error|fatal|sorry:)\b/i.test(line)) return { kind: 'warning', label: 'TOOL' };
  return { kind: 'raw', label: 'RAW' };
}

function titleFor(mode: ConsoleMode) {
  if (mode === 'compile') return 'COMPILE OUTPUT';
  if (mode === 'simulation') return 'SIMULATION OUTPUT';
  return 'YOSYS OUTPUT';
}

export default function OutputConsole({ mode, text, onClear, onOpenSource }: OutputConsoleProps) {
  const lines = text.replaceAll('\r\n', '\n').split('\n');

  return (
    <div className="console-panel panel" style={{ gridArea: 'console' }}>
      <div className="panel-title">
        <span>{titleFor(mode)}</span>
        <button onClick={onClear}>Clear</button>
      </div>
      <div className="console" role="log">
        {lines.map((line, index) => {
          const diagnostic = parseDiagnostic(line);
          const presentation = presentationFor(line, diagnostic);
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
