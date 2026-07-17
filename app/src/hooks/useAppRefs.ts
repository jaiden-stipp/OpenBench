import { useEffect, useRef } from 'react';
import type { editor } from 'monaco-editor';
import type { OpenFile } from '../types/ui';
import type { ResizeState } from './useLayoutPreferences';
import type { AppState } from './useAppState';

export function useAppRefs(state: AppState) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const waveformWorkerRef = useRef<Worker | null>(null);
  const projectGenerationRef = useRef(0);
  const pendingBreakpointHitRef = useRef<{ condition: string; time: number } | null>(null);
  const pendingRunSourcesRef = useRef<Record<string, string>>({});
  const watchRunRef = useRef<(() => Promise<void>) | null>(null);
  const watchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const lintRequestRef = useRef(0);
  const activeFilePathRef = useRef<string | null>(null);
  const openFilesRef = useRef<OpenFile[]>([]);
  useEffect(() => {
    activeFilePathRef.current = state.activeFilePath;
  }, [state.activeFilePath]);
  useEffect(() => {
    openFilesRef.current = state.openFiles;
  }, [state.openFiles]);
  return {
    editorRef,
    waveformWorkerRef,
    projectGenerationRef,
    pendingBreakpointHitRef,
    pendingRunSourcesRef,
    watchRunRef,
    watchTimerRef,
    resizeRef,
    lintRequestRef,
    activeFilePathRef,
    openFilesRef,
  };
}

export type AppRefs = ReturnType<typeof useAppRefs>;
