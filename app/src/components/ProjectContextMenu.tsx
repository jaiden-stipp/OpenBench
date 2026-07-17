interface ProjectContextMenuProps {
  node: ProjectNode;
  x: number;
  y: number;
  onNewFile: (node: ProjectNode) => void;
  onNewFolder: (node: ProjectNode) => void;
  onRename: (node: ProjectNode) => void;
  onDuplicate: (node: ProjectNode) => void;
  onCopyPath: (node: ProjectNode) => void;
  onReveal: (node: ProjectNode) => void;
  onRemove: (node: ProjectNode) => void;
  designModules: string[];
  currentTop: string;
  onSetDesignTop: (moduleName: string) => void;
}

export default function ProjectContextMenu(props: ProjectContextMenuProps) {
  return (
    <div
      className="project-context-menu"
      style={{
        left: Math.min(props.x, window.innerWidth - 210),
        top: Math.min(props.y, window.innerHeight - 260),
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {props.node.kind === 'directory' && (
        <>
          <button onClick={() => props.onNewFile(props.node)}>New File Here…</button>
          <button onClick={() => props.onNewFolder(props.node)}>New Folder Here…</button>
        </>
      )}
      <button onClick={() => props.onRename(props.node)}>Rename…</button>
      {props.node.kind === 'file' && (
        <>
          <button onClick={() => props.onDuplicate(props.node)}>Duplicate</button>
          {props.designModules.map((moduleName) => (
            <button
              key={moduleName}
              disabled={props.currentTop === moduleName}
              onClick={() => props.onSetDesignTop(moduleName)}
            >
              {props.currentTop === moduleName
                ? `Design top: ${moduleName}`
                : `Set ${moduleName} as Design Top`}
            </button>
          ))}
        </>
      )}
      <button onClick={() => props.onCopyPath(props.node)}>Copy Relative Path</button>
      <button onClick={() => props.onReveal(props.node)}>Show in File Explorer</button>
      <div className="menu-separator" />
      <button className="danger" onClick={() => props.onRemove(props.node)}>
        Move to Recycle Bin…
      </button>
    </div>
  );
}
