import { useEffect, useRef, useState } from 'react';

type MenuName = 'File' | 'Edit' | 'View' | 'Window' | 'Help';
type MenuItem = {
  label?: string;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
  action?: () => void;
};

function Menu({
  name,
  items,
  open,
  setOpen,
}: {
  name: MenuName;
  items: MenuItem[];
  open: MenuName | null;
  setOpen: (value: MenuName | null) => void;
}) {
  const active = open === name;
  return (
    <div className="app-menu-item">
      <button
        className={active ? 'active' : ''}
        onClick={() => setOpen(active ? null : name)}
        onPointerEnter={() => {
          if (open) setOpen(name);
        }}
      >
        {name}
      </button>
      {active && (
        <div className="app-menu-dropdown">
          {items.map((item, index) =>
            item.separator ? (
              <div key={index} className="menu-separator" />
            ) : (
              <button
                key={`${item.label}-${index}`}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(null);
                  item.action?.();
                }}
              >
                <span className="menu-check">{item.checked ? '✓' : ''}</span>
                <span>{item.label}</span>
                <kbd>{item.shortcut}</kbd>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export default function AppMenu({
  hasProject,
  hasFile,
  hasWaveform,
  hasSchematic,
  activeView,
  watchMode,
  theme,
  explorerDock,
  consoleDock,
  actions,
}: {
  hasProject: boolean;
  hasFile: boolean;
  hasWaveform: boolean;
  hasSchematic: boolean;
  activeView: 'source' | 'waveform' | 'schematic';
  watchMode: boolean;
  theme: 'dark' | 'light';
  explorerDock: 'left' | 'right';
  consoleDock: 'bottom' | 'right';
  actions: Record<string, () => void>;
}) {
  const [open, setOpen] = useState<MenuName | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);
  const menus: Record<MenuName, MenuItem[]> = {
    File: [
      { label: 'New Project…', shortcut: 'Ctrl+Shift+N', action: actions.newProject },
      { label: 'Open Project Folder…', shortcut: 'Ctrl+O', action: actions.openProject },
      { separator: true },
      {
        label: 'New HDL File…',
        shortcut: 'Ctrl+N',
        disabled: !hasProject,
        action: actions.newFile,
      },
      { label: 'New Folder…', disabled: !hasProject, action: actions.newFolder },
      { label: 'Add Existing Files…', disabled: !hasProject, action: actions.addFiles },
      {
        label: 'Generate Starter Testbench…',
        disabled: !hasProject,
        action: actions.stimulus,
      },
      { label: 'Save', shortcut: 'Ctrl+S', disabled: !hasFile, action: actions.save },
      { label: 'Save All', disabled: !hasProject, action: actions.saveAll },
      { separator: true },
      { label: 'Project Settings…', disabled: !hasProject, action: actions.settings },
      { separator: true },
      { label: 'Exit', action: actions.close },
    ],
    Edit: [
      { label: 'Undo', shortcut: 'Ctrl+Z', disabled: !hasFile, action: actions.undo },
      { label: 'Redo', shortcut: 'Ctrl+Y', disabled: !hasFile, action: actions.redo },
      { separator: true },
      { label: 'Cut', shortcut: 'Ctrl+X', disabled: !hasFile, action: actions.cut },
      { label: 'Copy', shortcut: 'Ctrl+C', disabled: !hasFile, action: actions.copy },
      { label: 'Paste', shortcut: 'Ctrl+V', disabled: !hasFile, action: actions.paste },
      { label: 'Select All', shortcut: 'Ctrl+A', disabled: !hasFile, action: actions.selectAll },
    ],
    View: [
      { label: 'Source Editor', checked: activeView === 'source', action: actions.source },
      {
        label: 'Waveform',
        disabled: !hasWaveform,
        checked: activeView === 'waveform',
        action: actions.waveform,
      },
      {
        label: 'RTL Schematic',
        disabled: !hasSchematic,
        checked: activeView === 'schematic',
        action: actions.schematic,
      },
      { separator: true },
      {
        label: 'Zoom Waveform In',
        shortcut: 'Ctrl++',
        disabled: !hasWaveform,
        action: actions.zoomIn,
      },
      {
        label: 'Zoom Waveform Out',
        shortcut: 'Ctrl+-',
        disabled: !hasWaveform,
        action: actions.zoomOut,
      },
      { label: theme === 'dark' ? 'Use Light Theme' : 'Use Dark Theme', action: actions.theme },
    ],
    Window: [
      { label: 'Explorer on Left', checked: explorerDock === 'left', action: actions.explorerLeft },
      {
        label: 'Explorer on Right',
        checked: explorerDock === 'right',
        action: actions.explorerRight,
      },
      {
        label: 'Console on Bottom',
        checked: consoleDock === 'bottom',
        action: actions.consoleBottom,
      },
      { label: 'Console on Right', checked: consoleDock === 'right', action: actions.consoleRight },
      { separator: true },
      {
        label: watchMode ? 'Disable Watch Mode' : 'Enable Watch Mode',
        checked: watchMode,
        disabled: !hasProject,
        action: actions.watch,
      },
      { separator: true },
      { label: 'Minimize', action: actions.minimize },
      { label: 'Toggle Maximize', action: actions.maximize },
    ],
    Help: [
      { label: 'Getting Started Tutorial', action: actions.tutorial },
      { label: 'Project Guide', disabled: !hasProject, action: actions.guidance },
      { label: 'Help and Supported HDL', action: actions.help },
      { label: 'Open Example Project', action: actions.example },
      { separator: true },
      { label: 'Send Feedback…', action: actions.feedback },
      { label: 'Report a Bug…', action: actions.reportBug },
      { separator: true },
      { label: 'About OpenBench', action: actions.about },
    ],
  };
  return (
    <nav className="app-menu" aria-label="Application menu" ref={ref}>
      {(Object.keys(menus) as MenuName[]).map((name) => (
        <Menu key={name} name={name} items={menus[name]} open={open} setOpen={setOpen} />
      ))}
    </nav>
  );
}
