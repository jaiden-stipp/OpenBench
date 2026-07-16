import type { Dispatch, SetStateAction } from 'react';

type LoadProject = (project: ProjectData, resetWorkspace?: boolean) => Promise<void>;
type OpenPath = (path: string, line?: number, column?: number) => Promise<void>;

type ProjectPickerOptions = {
  importSelection: ProjectSelection | null;
  loadProject: LoadProject;
  newProjectParent: string | null;
  openPath: OpenPath;
  setImportSelection: Dispatch<SetStateAction<ProjectSelection | null>>;
  setNewProjectParent: Dispatch<SetStateAction<string | null>>;
  setStatus: Dispatch<SetStateAction<string>>;
};

export function useProjectPickerActions(options: ProjectPickerOptions) {
  const openProject = async () => {
    try {
      const selection = await window.openbench.selectProjectFolder();
      if (selection) options.setImportSelection(selection);
    } catch (error) {
      options.setStatus(errorMessage(error));
    }
  };

  const activateSelection = async (name: string, files: string[]) => {
    if (!options.importSelection) return;
    try {
      const next = await window.openbench.activateProject({
        root: options.importSelection.root,
        name,
        files,
        suggestedTop: options.importSelection.suggestedTop,
        suggestedSimulationTop: options.importSelection.suggestedSimulationTop,
      });
      options.setImportSelection(null);
      await options.loadProject(next);
    } catch (error) {
      options.setStatus(errorMessage(error));
    }
  };

  const beginNewProject = async () => {
    try {
      const parent = await window.openbench.chooseNewProjectParent();
      if (parent) options.setNewProjectParent(parent);
    } catch (error) {
      options.setStatus(errorMessage(error));
    }
  };

  const createNewProject = async (name: string, withStarter: boolean) => {
    if (!options.newProjectParent) return;
    try {
      const next = await window.openbench.createProject({
        parent: options.newProjectParent,
        name,
        withStarter,
      });
      options.setNewProjectParent(null);
      await options.loadProject(next);
      const design = findDesignFile(next.files);
      if (design) await options.openPath(design);
      options.setStatus(
        withStarter
          ? 'Ready: press Run Simulation to see the starter waveform'
          : 'Empty project created; add an HDL file',
      );
    } catch (error) {
      options.setStatus(errorMessage(error));
    }
  };

  return { activateSelection, beginNewProject, createNewProject, openProject };
}

type LearningProjectOptions = {
  loadProject: LoadProject;
  openPath: OpenPath;
  setShowGuidance: Dispatch<SetStateAction<boolean>>;
  setShowTutorial: Dispatch<SetStateAction<boolean>>;
  setStatus: Dispatch<SetStateAction<string>>;
};

export function useLearningProjectActions(options: LearningProjectOptions) {
  const completeTutorial = () => {
    localStorage.setItem('openbench.tutorialComplete', 'true');
    options.setShowTutorial(false);
  };

  const openExampleProject = async (keepTutorial = false, lessonId = 'getting-started') => {
    try {
      if (!keepTutorial) completeTutorial();
      const next = await window.openbench.openExampleProject(lessonId);
      await options.loadProject(next);
      await options.openPath('getting_started_counter.sv');
      options.setStatus('Example ready: press Run Simulation');
    } catch (error) {
      options.setStatus(errorMessage(error));
      if (keepTutorial) throw error;
    }
  };

  const openLearningProject = async (lessonId: string) => {
    const next = await window.openbench.openExampleProject(lessonId);
    await options.loadProject(next);
    const design = findDesignFile(next.files);
    if (design) await options.openPath(design);
    options.setShowGuidance(false);
    options.setStatus(`${next.name} lesson ready: compile, simulate, and inspect the waveform`);
  };

  return { completeTutorial, openExampleProject, openLearningProject };
}

function findDesignFile(files: string[]) {
  return files.find((file) => !/(?:^|[_.-])(?:tb|testbench)(?:[_.-]|$)/i.test(file)) || files[0];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
