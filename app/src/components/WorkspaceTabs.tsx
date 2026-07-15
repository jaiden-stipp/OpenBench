import type { ActiveView, OpenFile } from '../types/ui';

interface ViewTabsProps {
  activeView: ActiveView;
  waveformSignalCount: number | null;
  rtlTop: string | null;
  lintStatus: 'idle' | 'checking' | 'clean' | 'issues';
  onSelectView: (view: ActiveView) => void;
}

interface FileTabsProps {
  files: OpenFile[];
  activeFilePath: string | null;
  onSelectFile: (path: string) => void;
  onCloseFile: (file: OpenFile) => void;
}

function lintLabel(status: ViewTabsProps['lintStatus']) {
  if (status === 'checking') return 'Checking…';
  if (status === 'issues') return 'Lint issues';
  if (status === 'clean') return 'Lint clean';
  return '';
}

export function ViewTabs(props: ViewTabsProps) {
  return (
    <div className="tabbar view-tabs">
      <button
        className={props.activeView === 'source' ? 'active' : ''}
        onClick={() => props.onSelectView('source')}
      >
        Source
      </button>
      <button
        className={props.activeView === 'waveform' ? 'active' : ''}
        onClick={() => props.onSelectView('waveform')}
      >
        Waveform{props.waveformSignalCount !== null ? ` · ${props.waveformSignalCount}` : ''}
      </button>
      <button
        className={props.activeView === 'schematic' ? 'active' : ''}
        onClick={() => props.onSelectView('schematic')}
      >
        RTL Schematic{props.rtlTop ? ` · ${props.rtlTop}` : ''}
      </button>
      <span className={`lint-state ${props.lintStatus}`}>{lintLabel(props.lintStatus)}</span>
    </div>
  );
}

export function FileTabs(props: FileTabsProps) {
  return (
    <div className="file-tabs">
      {props.files.map((file) => (
        <button
          key={file.path}
          className={file.path === props.activeFilePath ? 'active' : ''}
          title={file.path}
          onClick={() => props.onSelectFile(file.path)}
        >
          <span>{file.path}</span>
          {file.content !== file.savedContent && <i aria-label="Unsaved changes">●</i>}
          <b
            aria-label={`Close ${file.path}`}
            onClick={(event) => {
              event.stopPropagation();
              props.onCloseFile(file);
            }}
          >
            ×
          </b>
        </button>
      ))}
    </div>
  );
}
