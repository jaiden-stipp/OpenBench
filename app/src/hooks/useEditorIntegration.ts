import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { conceptForLine, defaultSourceConcept } from '../editor/systemVerilog';
import type { ContextMenuState, OpenFile, SourceConcept } from '../types/ui';

type Cursor = { path: string; line: number; column: number } | null;
type EditorIntegrationOptions = {
  activeFilePath: string | null;
  activeFilePathRef: MutableRefObject<string | null>;
  editorCursor: Cursor;
  editorRef: MutableRefObject<editor.IStandaloneCodeEditor | null>;
  setEditorCursor: Dispatch<SetStateAction<Cursor>>;
  setImportSelection: Dispatch<SetStateAction<ProjectSelection | null>>;
  setNewProjectParent: Dispatch<SetStateAction<string | null>>;
  setSourceConcept: Dispatch<SetStateAction<SourceConcept | null>>;
  updateOpenFile: (updater: (file: OpenFile) => OpenFile) => void;
};

export function useEditorIntegration(options: EditorIntegrationOptions) {
  const onEditorMount: OnMount = (instance) => {
    options.editorRef.current = instance;
    instance.onDidChangeCursorPosition((event) => {
      const line = instance.getModel()?.getLineContent(event.position.lineNumber) || '';
      options.setSourceConcept(conceptForLine(line));
      if (options.activeFilePathRef.current)
        options.setEditorCursor({
          path: options.activeFilePathRef.current,
          line: event.position.lineNumber,
          column: event.position.column,
        });
    });
    if (options.editorCursor?.path === options.activeFilePath) {
      instance.setPosition({
        lineNumber: options.editorCursor.line,
        column: options.editorCursor.column,
      });
      instance.revealLineInCenter(options.editorCursor.line);
    }
  };
  useEditorWindowEvents(options);
  return { onEditorMount };
}

function useEditorWindowEvents(options: EditorIntegrationOptions) {
  const { editorRef, setImportSelection, setNewProjectParent, setSourceConcept, updateOpenFile } =
    options;
  useEffect(() => {
    const insertText = (event: Event) =>
      updateOpenFile((file) => ({
        ...file,
        content: `${file.content}${(event as CustomEvent<string>).detail}`,
      }));
    const showConcept = (event: Event) => {
      const instance = editorRef.current;
      if (!instance) return;
      const detail = (event as CustomEvent<{ line: number; column: number }>).detail;
      instance.setPosition({ lineNumber: detail.line, column: detail.column });
      setSourceConcept(
        conceptForLine(instance.getModel()?.getLineContent(detail.line) || '') ||
          defaultSourceConcept(),
      );
      instance.focus();
      void instance.getAction('editor.action.showHover')?.run();
    };
    const showNewProject = (event: Event) =>
      setNewProjectParent((event as CustomEvent<string>).detail);
    const showImport = (event: Event) =>
      setImportSelection((event as CustomEvent<ProjectSelection>).detail);
    window.addEventListener('rtlbench:insert-editor-text', insertText);
    window.addEventListener('rtlbench:show-concept', showConcept);
    window.addEventListener('openbench:show-new-project', showNewProject);
    window.addEventListener('openbench:show-import', showImport);
    return () => {
      window.removeEventListener('rtlbench:insert-editor-text', insertText);
      window.removeEventListener('rtlbench:show-concept', showConcept);
      window.removeEventListener('openbench:show-new-project', showNewProject);
      window.removeEventListener('openbench:show-import', showImport);
    };
  }, [editorRef, setImportSelection, setNewProjectParent, setSourceConcept, updateOpenFile]);
}

export function useDismissContextMenu(
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>,
) {
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
    };
  }, [setContextMenu]);
}
