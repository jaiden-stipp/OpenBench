import { useState } from 'react';

interface ProjectExplorerProps {
  project: ProjectData | null;
  onOpenFile: (path: string) => void;
  onOpenContextMenu: (node: ProjectNode, x: number, y: number) => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onAddFiles: () => void;
  onRefresh: () => void;
  onOpenExample: () => void;
  onNewProject: () => void;
  onOpenProject: () => void;
}

interface TreeNodeProps {
  node: ProjectNode;
  onOpen: (path: string) => void;
  onContext: (node: ProjectNode, x: number, y: number) => void;
}

function TreeNode({ node, onOpen, onContext }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const openContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    onContext(node, event.clientX, event.clientY);
  };

  if (node.kind === 'file') {
    return (
      <button
        className="tree-file"
        onClick={() => onOpen(node.path)}
        onContextMenu={openContextMenu}
      >
        <span className="file-dot" />
        {node.name}
      </button>
    );
  }

  return (
    <div className="tree-directory">
      <button
        className="tree-folder"
        onClick={() => setExpanded((value) => !value)}
        onContextMenu={openContextMenu}
      >
        <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        {node.name}
      </button>
      {expanded && (
        <div className="tree-children">
          {node.children?.map((child) => (
            <TreeNode key={child.path} node={child} onOpen={onOpen} onContext={onContext} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProjectExplorer(props: ProjectExplorerProps) {
  const { project } = props;

  return (
    <aside className="explorer panel" style={{ gridArea: 'explorer' }}>
      <div className="panel-title">
        <span>PROJECT</span>
        <div className="panel-actions">
          <button title="New HDL file" disabled={!project} onClick={props.onNewFile}>
            +
          </button>
          <button title="New folder" disabled={!project} onClick={props.onNewFolder}>
            Folder+
          </button>
          <button title="Add existing HDL files" disabled={!project} onClick={props.onAddFiles}>
            Add
          </button>
          <button title="Refresh" disabled={!project} onClick={props.onRefresh}>
            ↻
          </button>
        </div>
      </div>

      {project ? (
        <>
          <div className="project-root">
            {project.name}
            <small>
              {project.files.length} files · {project.folders.length} folders
            </small>
          </div>
          <div className="tree">
            {project.tree.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                onOpen={props.onOpenFile}
                onContext={props.onOpenContextMenu}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="empty">
          No project open
          <br />
          <button onClick={props.onOpenExample}>Explore Example</button>
          <button onClick={props.onNewProject}>New Project</button>
          <button onClick={props.onOpenProject}>Add Folder</button>
        </div>
      )}
    </aside>
  );
}
