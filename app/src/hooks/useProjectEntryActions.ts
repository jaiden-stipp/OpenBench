import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { ContextMenuState, OpenFile, PromptState } from '../types/ui';

type OpenPath = (path: string, line?: number, column?: number) => Promise<void>;

type EntryActionOptions = {
  activeFilePath: string | null;
  openFiles: OpenFile[];
  openPath: OpenPath;
  setActiveFilePath: Dispatch<SetStateAction<string | null>>;
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
  setOpenFiles: Dispatch<SetStateAction<OpenFile[]>>;
  setProject: Dispatch<SetStateAction<ProjectData | null>>;
  setStatus: Dispatch<SetStateAction<string>>;
};

export function useProjectEntryActions(options: EntryActionOptions) {
  const { setProject } = options;
  const refreshProject = useCallback(async () => {
    const next = await window.openbench.refreshProject();
    setProject(next);
    return next;
  }, [setProject]);

  const addProjectFiles = async () => {
    try {
      const added = await window.openbench.addProjectFiles();
      if (added.length) {
        await refreshProject();
        await options.openPath(added[0]);
        options.setStatus(`Added ${added.length} file${added.length === 1 ? '' : 's'}`);
      }
    } catch (error) {
      options.setStatus(errorMessage(error));
    }
  };

  const removeProjectEntry = async (node: ProjectNode) => {
    try {
      if (await window.openbench.removeEntry(node.path)) {
        const remaining = options.openFiles.filter(
          (file) => file.path !== node.path && !file.path.startsWith(`${node.path}/`),
        );
        options.setOpenFiles(remaining);
        if (
          options.activeFilePath === node.path ||
          options.activeFilePath?.startsWith(`${node.path}/`)
        )
          options.setActiveFilePath(remaining.at(-1)?.path || null);
        await refreshProject();
        options.setStatus(`Moved ${node.name} to the Recycle Bin`);
      }
    } catch (error) {
      options.setStatus(errorMessage(error));
    }
    options.setContextMenu(null);
  };

  const duplicateProjectFile = async (node: ProjectNode) => {
    try {
      const copy = await window.openbench.duplicateFile(node.path);
      await refreshProject();
      options.setContextMenu(null);
      await options.openPath(copy);
    } catch (error) {
      options.setStatus(errorMessage(error));
    }
  };

  return { addProjectFiles, duplicateProjectFile, refreshProject, removeProjectEntry };
}

type PromptActionOptions = {
  activeFilePath: string | null;
  openPath: OpenPath;
  prompt: PromptState | null;
  refreshProject: () => Promise<ProjectData>;
  setActiveFilePath: Dispatch<SetStateAction<string | null>>;
  setOpenFiles: Dispatch<SetStateAction<OpenFile[]>>;
  setPrompt: Dispatch<SetStateAction<PromptState | null>>;
  setStatus: Dispatch<SetStateAction<string>>;
};

export function useProjectPromptActions(options: PromptActionOptions) {
  const submitPrompt = async (value: string) => {
    if (!options.prompt) return;
    try {
      if (options.prompt.kind === 'new-file') await createFile(value, options);
      else if (options.prompt.kind === 'new-folder') await createFolder(value, options);
      else if (options.prompt.node) await renameEntry(value, options);
    } catch (error) {
      options.setStatus(errorMessage(error));
    }
  };
  return { submitPrompt };
}

async function createFile(value: string, options: PromptActionOptions) {
  const base = options.prompt?.node?.kind === 'directory' ? options.prompt.node.path : '';
  const path = base ? `${base}/${value}` : value;
  const created = await window.openbench.createFile(path, `// ${value}\n`);
  options.setPrompt(null);
  await options.refreshProject();
  await options.openPath(created);
}

async function createFolder(value: string, options: PromptActionOptions) {
  const base = options.prompt?.node?.kind === 'directory' ? options.prompt.node.path : '';
  const path = base ? `${base}/${value}` : value;
  const created = await window.openbench.createFolder(path);
  options.setPrompt(null);
  await options.refreshProject();
  options.setStatus(`Created folder ${created}`);
}

async function renameEntry(value: string, options: PromptActionOptions) {
  const oldPath = options.prompt!.node!.path;
  const renamed = await window.openbench.renameEntry(oldPath, value);
  options.setPrompt(null);
  await options.refreshProject();
  options.setOpenFiles((current) =>
    current.map((file) =>
      file.path === oldPath || file.path.startsWith(`${oldPath}/`)
        ? { ...file, path: `${renamed}${file.path.slice(oldPath.length)}` }
        : file,
    ),
  );
  if (
    options.activeFilePath &&
    (options.activeFilePath === oldPath || options.activeFilePath.startsWith(`${oldPath}/`))
  )
    options.setActiveFilePath(`${renamed}${options.activeFilePath.slice(oldPath.length)}`);
}

export function useFileTabActions(
  openFiles: OpenFile[],
  activeFilePath: string | null,
  setOpenFiles: Dispatch<SetStateAction<OpenFile[]>>,
  setActiveFilePath: Dispatch<SetStateAction<string | null>>,
) {
  const closeFileTab = async (file: OpenFile) => {
    if (file.content !== file.savedContent) {
      await window.openbench.writeFile(file.path, file.content);
      await window.openbench.clearRecoveryDraft(file.path);
    }
    const remaining = openFiles.filter((item) => item.path !== file.path);
    setOpenFiles(remaining);
    if (activeFilePath === file.path) setActiveFilePath(remaining.at(-1)?.path || null);
  };
  return { closeFileTab };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
