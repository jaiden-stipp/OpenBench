import type { BeforeMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import * as localMonaco from 'monaco-editor';

import type { SourceConcept } from '../types/ui';

const concepts: Array<SourceConcept & { match: RegExp }> = [
  {
    match: /always_ff|always\s*@\s*\([^)]*(?:posedge|negedge)/,
    title: 'Edge-triggered sequential logic',
    text: 'This block runs on a clock/reset edge. Use non-blocking (`<=`) assignments for registers so every register observes the old state together.',
  },
  {
    match: /always_comb|always\s*@\*/,
    title: 'Combinational logic',
    text: 'This block recalculates whenever an input it reads changes. Assign every output on every path to avoid accidentally creating storage.',
  },
  {
    match: /<=/,
    title: 'Non-blocking assignment',
    text: 'The new value is scheduled for the end of the current simulation step. This is normally the right assignment for clocked registers.',
  },
  {
    match: /(^|[^<>=!])=([^=]|$)/,
    title: 'Blocking assignment',
    text: 'The value changes immediately within this procedural block. This is normally used for combinational calculations, not clocked state.',
  },
  {
    match: /\bassign\b/,
    title: 'Continuous assignment',
    text: 'The right-hand expression continuously drives the wire whenever any of its inputs changes.',
  },
  {
    match: /\blogic\b/,
    title: 'SystemVerilog logic',
    text: '`logic` is a four-state variable type: it can hold 0, 1, X (unknown), or Z (high impedance).',
  },
];

let hoverHelpRegistered = false;

export const conceptForLine = (line: string): SourceConcept | null =>
  concepts.find((concept) => concept.match.test(line)) ?? null;

export const defaultSourceConcept = (): SourceConcept => concepts[0];

export const configureSystemVerilog: BeforeMount = (monaco) => {
  const alreadyRegistered = monaco.languages
    .getLanguages()
    .some((language: { id: string }) => language.id === 'systemverilog');

  if (!alreadyRegistered) {
    monaco.languages.register({
      id: 'systemverilog',
      extensions: ['.sv', '.svh', '.v', '.vh'],
    });
    monaco.languages.setMonarchTokensProvider('systemverilog', {
      keywords: [
        'module',
        'endmodule',
        'input',
        'output',
        'inout',
        'wire',
        'reg',
        'logic',
        'always',
        'always_ff',
        'always_comb',
        'begin',
        'end',
        'if',
        'else',
        'case',
        'endcase',
        'assign',
        'parameter',
        'localparam',
        'generate',
        'endgenerate',
        'for',
        'posedge',
        'negedge',
        'initial',
        'typedef',
        'struct',
        'enum',
        'package',
        'endpackage',
        'import',
      ],
      tokenizer: {
        root: [
          [/\/\/.*$/, 'comment'],
          [/\/\*/, 'comment', '@comment'],
          [/[a-zA-Z_$][\w$]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
          [/\d+'[bodhBODH][0-9a-fA-F_xzXZ?]+/, 'number'],
          [/\d+/, 'number'],
          [/"([^"\\]|\\.)*"/, 'string'],
          [/[{}()[\]]/, '@brackets'],
          [/[;,.]/, 'delimiter'],
          [/[=><!~?:&|+\-*\/%^]+/, 'operator'],
        ],
        comment: [
          [/[^/*]+/, 'comment'],
          [/\*\//, 'comment', '@pop'],
          [/[/*]/, 'comment'],
        ],
      },
    });
  }

  if (hoverHelpRegistered) return;
  hoverHelpRegistered = true;
  monaco.languages.registerHoverProvider('systemverilog', {
    provideHover(model: editor.ITextModel, position: localMonaco.Position) {
      const help = conceptForLine(model.getLineContent(position.lineNumber));
      if (!help) return null;
      return {
        range: new monaco.Range(
          position.lineNumber,
          1,
          position.lineNumber,
          model.getLineMaxColumn(position.lineNumber),
        ),
        contents: [{ value: `**${help.title}**` }, { value: help.text }],
      };
    },
  });
};
