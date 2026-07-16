import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { VcdData } from '../vcdParser';
import type { YosysNetlist } from '../netlistGraph';

type ProjectSettingsOptions = {
  settings: ProjectSettings;
  setHasRunSimulation: Dispatch<SetStateAction<boolean>>;
  setNetlist: Dispatch<SetStateAction<YosysNetlist | null>>;
  setRtlTop: Dispatch<SetStateAction<string | null>>;
  setSettings: Dispatch<SetStateAction<ProjectSettings>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setWaveform: Dispatch<SetStateAction<VcdData | null>>;
  setWaveformName: Dispatch<SetStateAction<string | null>>;
  setWaveformSession: Dispatch<SetStateAction<WaveformSession | null>>;
};

export function useProjectSettings(options: ProjectSettingsOptions) {
  const {
    settings,
    setHasRunSimulation,
    setNetlist,
    setRtlTop,
    setSettings,
    setStatus,
    setWaveform,
    setWaveformName,
    setWaveformSession,
  } = options;
  return useCallback(
    async (next: ProjectSettings) => {
      const saved = await window.openbench.saveSettings(next);
      const includePathsChanged =
        settings.includePaths.join('\0') !== saved.includePaths.join('\0');
      const rtlChanged = settings.topModule !== saved.topModule || includePathsChanged;
      const simulationChanged =
        settings.simulationTop !== saved.simulationTop ||
        settings.simulator !== saved.simulator ||
        settings.toolchainPath !== saved.toolchainPath ||
        includePathsChanged;
      setSettings(saved);
      if (rtlChanged) {
        setNetlist(null);
        setRtlTop(null);
      }
      if (simulationChanged) {
        setWaveform(null);
        setWaveformName(null);
        setWaveformSession(null);
        setHasRunSimulation(false);
      }
      setStatus(
        rtlChanged || simulationChanged
          ? 'Settings saved; rerun the affected analysis to refresh stale results'
          : 'Project settings saved',
      );
    },
    [
      setHasRunSimulation,
      setNetlist,
      setRtlTop,
      setSettings,
      setStatus,
      setWaveform,
      setWaveformName,
      setWaveformSession,
      settings,
    ],
  );
}
