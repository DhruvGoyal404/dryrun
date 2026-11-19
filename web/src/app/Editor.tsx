// CodeMirror 6 with Python highlighting, line numbers, the current-line marker during
// replay, and a gutter heatmap of line hit counts. Clicking a hit count runs to that line.
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { bracketMatching, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  gutter,
  GutterMarker,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { useEffect, useRef } from "react";

interface Marks {
  current: number | null;
  error: number | null;
  hits: Record<string, number>;
}

const setMarks = StateEffect.define<Marks>();

const marksField = StateField.define<Marks>({
  create: () => ({ current: null, error: null, hits: {} }),
  update: (value, tr) => tr.effects.find((e) => e.is(setMarks))?.value ?? value,
});

const lineDecorations = EditorView.decorations.compute([marksField], (state) => {
  const { current, error } = state.field(marksField);
  const builder = new RangeSetBuilder<Decoration>();
  const lines = [...new Set([current, error].filter((l): l is number => l !== null && l >= 1 && l <= state.doc.lines))].sort((a, b) => a - b);
  for (const n of lines) {
    const cls = [n === current ? "cm-now" : "", n === error ? "cm-error-line" : ""].join(" ").trim();
    builder.add(state.doc.line(n).from, state.doc.line(n).from, Decoration.line({ class: cls }));
  }
  return builder.finish() as DecorationSet;
});

class HeatMarker extends GutterMarker {
  constructor(
    readonly count: number,
    readonly level: number,
  ) {
    super();
  }
  eq(other: HeatMarker) {
    return other.count === this.count && other.level === this.level;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = `cm-heat cm-heat-${this.level}`;
    el.textContent = this.count > 999 ? `${Math.round(this.count / 1000)}k` : String(this.count);
    el.title = `Ran ${this.count} time${this.count === 1 ? "" : "s"}. Click to run to the next time it runs.`;
    return el;
  }
}

function heatGutter(onRunToLine: (line: number) => void) {
  return gutter({
    class: "cm-heat-gutter",
    lineMarker(view, line) {
      const { hits } = view.state.field(marksField);
      const n = view.state.doc.lineAt(line.from).number;
      const count = hits[String(n)];
      if (!count) return null;
      const max = Math.max(...Object.values(hits));
      const level = Math.min(4, Math.ceil((Math.log(count + 1) / Math.log(max + 1)) * 4));
      return new HeatMarker(count, level);
    },
    lineMarkerChange: (update) => update.transactions.some((tr) => tr.effects.some((e) => e.is(setMarks))),
    domEventHandlers: {
      mousedown(view, line) {
        const n = view.state.doc.lineAt(line.from).number;
        if (view.state.field(marksField).hits[String(n)]) {
          onRunToLine(n);
          return true;
        }
        return false;
      },
    },
  });
}

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword], class: "tok-kw" },
  { tag: [t.string, t.special(t.string)], class: "tok-str" },
  { tag: [t.number, t.bool, t.null], class: "tok-num" },
  { tag: [t.comment, t.lineComment], class: "tok-comment" },
  { tag: [t.function(t.definition(t.variableName)), t.definition(t.className)], class: "tok-def" },
  { tag: [t.self, t.special(t.variableName)], class: "tok-self" },
]);

export interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  current: number | null;
  error: number | null;
  hits: Record<string, number>;
  onRunToLine: (line: number) => void;
  onCursorLine?: (line: number) => void;
  onRun: () => void;
  id?: string;
}

export function Editor({ value, onChange, label, current, error, hits, onRunToLine, onCursorLine, onRun, id }: EditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onRunToLine, onCursorLine, onRun });
  useEffect(() => {
    callbacks.current = { onChange, onRunToLine, onCursorLine, onRun };
  });
  const labelling = useRef(new Compartment());

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          heatGutter((n) => callbacks.current.onRunToLine(n)),
          history(),
          indentOnInput(),
          bracketMatching(),
          highlightActiveLine(),
          indentUnit.of("    "),
          EditorState.tabSize.of(4),
          python(),
          syntaxHighlighting(highlight),
          marksField,
          lineDecorations,
          labelling.current.of(EditorView.contentAttributes.of({ "aria-label": label })),
          keymap.of([
            { key: "Mod-Enter", run: () => (callbacks.current.onRun(), true) },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) callbacks.current.onChange(u.state.doc.toString());
            if (u.selectionSet || u.docChanged) callbacks.current.onCursorLine?.(u.state.doc.lineAt(u.state.selection.main.head).number);
          }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // The view is created once; value changes from outside are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: labelling.current.reconfigure(EditorView.contentAttributes.of({ "aria-label": label })) });
  }, [label]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch({ effects: setMarks.of({ current, error, hits }) });
    if (current !== null && current >= 1 && current <= v.state.doc.lines) {
      v.dispatch({ effects: EditorView.scrollIntoView(v.state.doc.line(current).from, { y: "nearest" }) });
    }
  }, [current, error, hits]);

  return <div className="editor" ref={host} id={id} />;
}
