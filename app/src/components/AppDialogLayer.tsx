import type { ComponentProps, Dispatch, SetStateAction } from 'react';
import SettingsDialog from '../SettingsDialog';
import HelpDialog from '../HelpDialog';
import AboutDialog from './AboutDialog';
import GuidanceCenter from '../GuidanceCenter';
import OnboardingDialog from '../OnboardingDialog';
import ProjectContextMenu from './ProjectContextMenu';
import {
  ImportProjectDialog,
  NewProjectDialog,
  StimulusDialog,
  TextPromptDialog,
} from '../ProjectDialogs';
import type { YosysNetlist } from '../netlistGraph';
import type {
  AccessibilityPreferences,
  ActiveView,
  ContextMenuState,
  PromptState,
} from '../types/ui';

type DialogLayerProps = {
  accessibility: AccessibilityPreferences;
  activeView: ActiveView;
  compilePassed: boolean;
  consoleText: string;
  contextMenu: ContextMenuState | null;
  importSelection: ProjectSelection | null;
  netlist: YosysNetlist | null;
  newProjectParent: string | null;
  project: ProjectData | null;
  projectInsights: ReturnType<typeof import('../projectInsights').analyzeProjectSources>;
  prompt: PromptState | null;
  rtlTop: string | null;
  settings: ProjectSettings;
  showAbout: boolean;
  showGuidance: boolean;
  showHelp: boolean;
  showSettings: boolean;
  showTutorial: boolean;
  stimulusModule: string | null;
  waveformInteracted: boolean;
  waveformReady: boolean;
  waveformInsights: ReturnType<typeof import('../projectInsights').explainWaveform>;
  onActivateSelection: (
    name: string,
    files: string[],
    topModule: string,
    simulationTop: string,
  ) => void;
  onCompleteTutorial: () => void;
  onComposeEmail: (kind: 'feedback' | 'bug') => void;
  onCreateProject: (name: string, withStarter: boolean, topModule: string) => void;
  onDuplicateProjectFile: (node: ProjectNode) => void;
  onGenerateTestbench: (
    moduleName: string,
    options: Parameters<ComponentProps<typeof StimulusDialog>['onGenerate']>[0],
  ) => void;
  onOpenLearningProject: (lessonId: string) => Promise<void>;
  onOpenTutorialExample: () => Promise<void>;
  onRemoveProjectEntry: (node: ProjectNode) => void;
  onSaveSettings: (settings: ProjectSettings) => Promise<void>;
  onSetDesignTop: (moduleName: string) => Promise<void>;
  onSubmitPrompt: (value: string) => void;
  setAccessibility: Dispatch<SetStateAction<AccessibilityPreferences>>;
  setActiveView: Dispatch<SetStateAction<ActiveView>>;
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
  setImportSelection: Dispatch<SetStateAction<ProjectSelection | null>>;
  setNewProjectParent: Dispatch<SetStateAction<string | null>>;
  setPrompt: Dispatch<SetStateAction<PromptState | null>>;
  setSchematicModuleFocus: Dispatch<SetStateAction<string | null>>;
  setShowAbout: Dispatch<SetStateAction<boolean>>;
  setShowGuidance: Dispatch<SetStateAction<boolean>>;
  setShowHelp: Dispatch<SetStateAction<boolean>>;
  setShowSettings: Dispatch<SetStateAction<boolean>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setStimulusModule: Dispatch<SetStateAction<string | null>>;
};

export default function AppDialogLayer(props: DialogLayerProps) {
  return (
    <>
      <SupportDialogs {...props} />
      <ProjectCreationDialogs {...props} />
      <TutorialAndPromptDialogs {...props} />
      <ContextMenuDialog {...props} />
    </>
  );
}

function SupportDialogs(props: DialogLayerProps) {
  const testbenchKeys = new Set(
    props.projectInsights.testbenches.map((module) => `${module.file}:${module.name}`),
  );
  return (
    <>
      {props.showSettings && (
        <SettingsDialog
          initial={props.settings}
          designModules={props.projectInsights.modules
            .filter((module) => !testbenchKeys.has(`${module.file}:${module.name}`))
            .map((module) => module.name)}
          simulationModules={props.projectInsights.testbenches.map((module) => module.name)}
          onClose={() => props.setShowSettings(false)}
          onSave={async (next) => {
            await props.onSaveSettings(next);
          }}
        />
      )}
      {props.showHelp && (
        <HelpDialog
          simulator={props.settings.simulator}
          onClose={() => props.setShowHelp(false)}
          onComposeEmail={props.onComposeEmail}
        />
      )}
      {props.showAbout && <AboutDialog onClose={() => props.setShowAbout(false)} />}
      {props.showGuidance && props.project && (
        <GuidanceCenter
          project={props.project}
          settings={props.settings}
          insights={props.projectInsights}
          waveformInsights={props.waveformInsights}
          netlist={props.netlist}
          rtlTop={props.rtlTop}
          consoleText={props.consoleText}
          accessibility={props.accessibility}
          onAccessibility={props.setAccessibility}
          onClose={() => props.setShowGuidance(false)}
          onSaveSettings={props.onSaveSettings}
          onOpenModule={(name) => {
            props.setSchematicModuleFocus(name);
            props.setActiveView('schematic');
            props.setShowGuidance(false);
          }}
          onOpenLearningProject={props.onOpenLearningProject}
        />
      )}
    </>
  );
}

function ProjectCreationDialogs(props: DialogLayerProps) {
  const module = props.stimulusModule && props.netlist?.modules?.[props.stimulusModule];
  return (
    <>
      {props.stimulusModule && module && (
        <StimulusDialog
          moduleName={props.stimulusModule}
          inputs={(Object.entries(module.ports || {}) as Array<[string, { direction?: string }]>)
            .filter(([, port]) => port.direction === 'input')
            .map(([name]) => name)
            .filter((name) => !/^(?:clk|clock|rst|reset|rst_n|reset_n)$/i.test(name))}
          onCancel={() => props.setStimulusModule(null)}
          onGenerate={(options) => {
            const name = props.stimulusModule!;
            props.setStimulusModule(null);
            props.onGenerateTestbench(name, options);
          }}
        />
      )}
      {props.importSelection && (
        <ImportProjectDialog
          selection={props.importSelection}
          onCancel={() => props.setImportSelection(null)}
          onConfirm={props.onActivateSelection}
        />
      )}
      {props.newProjectParent && (
        <NewProjectDialog
          parent={props.newProjectParent}
          onCancel={() => props.setNewProjectParent(null)}
          onCreate={props.onCreateProject}
        />
      )}
    </>
  );
}

function TutorialAndPromptDialogs(props: DialogLayerProps) {
  return (
    <>
      {props.showTutorial && (
        <OnboardingDialog
          onSkip={props.onCompleteTutorial}
          onFinish={props.onCompleteTutorial}
          onOpenExample={props.onOpenTutorialExample}
          compilePassed={props.compilePassed}
          waveformReady={props.waveformReady}
          waveformInteracted={props.waveformInteracted}
          schematicReady={Boolean(props.netlist)}
          activeView={props.activeView}
        />
      )}
      {props.prompt && (
        <TextPromptDialog
          title={promptTitle(props.prompt)}
          label={promptLabel(props.prompt)}
          initialValue={props.prompt.initialValue}
          confirmLabel={props.prompt.kind === 'rename' ? 'Rename' : 'Create'}
          onCancel={() => props.setPrompt(null)}
          onConfirm={props.onSubmitPrompt}
        />
      )}
    </>
  );
}

function ContextMenuDialog(props: DialogLayerProps) {
  if (!props.contextMenu) return null;
  const testbenchKeys = new Set(
    props.projectInsights.testbenches.map((module) => `${module.file}:${module.name}`),
  );
  const designModules = props.projectInsights.modules
    .filter(
      (module) =>
        module.file === props.contextMenu?.node.path &&
        !testbenchKeys.has(`${module.file}:${module.name}`),
    )
    .map((module) => module.name);
  return (
    <ProjectContextMenu
      {...props.contextMenu}
      designModules={designModules}
      currentTop={props.settings.topModule}
      onNewFile={(node) => openPrompt('new-file', node, 'new_module.sv', props)}
      onNewFolder={(node) => openPrompt('new-folder', node, 'subfolder', props)}
      onRename={(node) => openPrompt('rename', node, node.name, props)}
      onDuplicate={props.onDuplicateProjectFile}
      onCopyPath={(node) => {
        void navigator.clipboard.writeText(node.path);
        props.setStatus(`Copied ${node.path}`);
        props.setContextMenu(null);
      }}
      onReveal={(node) => {
        void window.rtldeck.revealFile(node.path);
        props.setContextMenu(null);
      }}
      onRemove={props.onRemoveProjectEntry}
      onSetDesignTop={(moduleName) => {
        props.setContextMenu(null);
        void props.onSetDesignTop(moduleName);
      }}
    />
  );
}

function openPrompt(
  kind: PromptState['kind'],
  node: ProjectNode,
  initialValue: string,
  props: DialogLayerProps,
) {
  props.setPrompt({ kind, node, initialValue });
  props.setContextMenu(null);
}

function promptTitle(prompt: PromptState) {
  return prompt.kind === 'new-file'
    ? 'Create HDL file'
    : prompt.kind === 'new-folder'
      ? 'Create folder'
      : `Rename ${prompt.node?.name}`;
}

function promptLabel(prompt: PromptState) {
  return prompt.kind === 'new-file'
    ? 'Project-relative filename'
    : prompt.kind === 'new-folder'
      ? 'Project-relative folder name'
      : 'New name';
}
