import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { detect, parseHints, type View } from "../detect/detect";
import { Engine, type EngineStatus } from "../engine/client";
import type { RunRequest } from "../engine/protocol";
import { EXAMPLES, exampleById, type Example } from "../library";
import { decode, encode, ShareError } from "../share";
import { Model } from "../trace/model";
import { landing, nextCall, prevCall, runToLine } from "../trace/navigate";
import type { Trace } from "../trace/types";
import { Canvas, Frames, Output } from "./Canvas";
import { CompareTable, GrowthChart, type GrowthPoint } from "./Compare";
import { KeysDialog, LibraryDialog } from "./Dialogs";
import { Editor } from "./Editor";
import { Icon } from "./Icon";
import { SPEEDS, Timeline } from "./Timeline";

const engine = new Engine();
const DRAFT_KEY = "dryrun:draft";
const THEME_KEY = "dryrun:theme";

interface Run {
  model: Model;
  views: View[];
  code: string;
}

interface Draft {
  code: string;
  codeB: string;
  mode: "stdin" | "call";
  stdin: string;
  call: string;
}

const first = EXAMPLES[0]!;
const fromExample = (e: Example, codeB = ""): Draft => ({ code: e.code, codeB, mode: e.mode, stdin: e.stdin, call: e.call });

const BRUTE_B = `# A brute-force pair search to compare with A: every pair, no pointers.
def pair_with_sum(nums, target):
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] + nums[j] == target:
                return (i, j)
    return None
`;

function loadDraft(): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as Draft | null;
    return d && typeof d.code === "string" ? d : null;
  } catch {
    return null;
  }
}

const CAP_TEXT: Record<string, string> = {
  steps: "it reached the step limit",
  time: "it ran past the time limit",
  size: "the trace grew past its size limit",
  depth: "the recursion went deeper than the depth limit",
  calls: "it made more calls than the call limit",
  watchdog: "it stopped responding, so DryRun restarted Python",
};

function Banner({ trace, which }: { trace: Trace; which?: string }) {
  const who = which ? `${which}: ` : "";
  if (trace.capped) {
    const c = trace.capped;
    const limit =
      c.reason === "steps" ? ` (${trace.limits.max_steps?.toLocaleString("en")} steps)` : c.reason === "depth" ? ` (${trace.limits.max_depth} nested calls)` : c.reason === "watchdog" ? ` (${Math.round((trace.limits.watchdog_ms ?? 15000) / 1000)} s)` : c.reason === "time" ? ` (${trace.limits.max_seconds} s)` : "";
    return (
      <div className="banner is-capped" role="status">
        <p>
          {who}Stopped early: {CAP_TEXT[c.reason]}
          {limit}
          {c.line ? `, at line ${c.line}` : ""}
          {c.step ? ` after ${c.step.toLocaleString("en")} steps` : ""}. Everything up to there is below.
          {c.reason === "watchdog" && " A single line that runs for a long time (a huge range, a loop inside a builtin) can't be traced step by step; try a smaller input."}
        </p>
      </div>
    );
  }
  if (trace.error) {
    return (
      <div className="banner is-error" role="alert">
        <p>
          {who}
          {trace.error.where === "call" ? "The call has a syntax error: " : trace.error.line ? `Line ${trace.error.line} raised ` : ""}
          <b>{trace.error.type}</b>: {trace.error.msg}
        </p>
        {trace.error.tb && <pre className="tb">{trace.error.tb}</pre>}
      </div>
    );
  }
  return null;
}

function applyTheme(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* private mode: the choice lasts this visit */
  }
}

export function App() {
  const [draft, setDraft] = useState<Draft>(() => loadDraft() ?? fromExample(first, BRUTE_B));
  const [compare, setCompare] = useState(false);
  const [runA, setRunA] = useState<Run | null>(null);
  const [runB, setRunB] = useState<Run | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<EngineStatus>({ state: "idle" });
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [tab, setTab] = useState<"code" | "run">("code");
  const [dialog, setDialog] = useState<null | "library" | "keys">(null);
  const [cursorLine, setCursorLine] = useState(1);
  const [sizes, setSizes] = useState("4 8 16 32");
  const [growth, setGrowth] = useState<GrowthPoint[] | null>(null);
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    const unsubscribe = engine.subscribe(setStatus);
    return () => {
      unsubscribe();
    };
  }, []);
  useEffect(() => engine.boot(), []);

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        /* storage full or blocked: drafts are a convenience */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [draft]);

  const say = useCallback((text: string, error = false) => {
    setToast({ text, error });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.error ? 8000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const request = useCallback((code: string, d: Draft): RunRequest => ({ code, stdin: d.mode === "stdin" ? d.stdin : "", call: d.mode === "call" ? d.call : "" }), []);

  const run = useCallback(
    async (d: Draft = draft, withCompare = compare) => {
      setRunning(true);
      setPlaying(false);
      setGrowth(null);
      try {
        const traceA = await engine.run(request(d.code, d));
        const a: Run = { model: new Model(traceA), views: [], code: d.code };
        a.views = detect(a.model, d.code);
        let b: Run | null = null;
        if (withCompare) {
          const traceB = await engine.run(request(d.codeB, d));
          b = { model: new Model(traceB), views: [], code: d.codeB };
          b.views = detect(b.model, d.codeB);
        }
        setRunA(a);
        setRunB(b);
        setStep(landing(a.model));
        setTab("run");
        const problems = parseHints(d.code).problems;
        if (problems.length) say(`Hint ignored: ${problems.join("; ")}`, true);
        setAnnounce(`Traced ${traceA.counts.steps} steps${traceA.error ? `, ended with ${traceA.error.type}` : ""}.`);
      } catch (error) {
        say(error instanceof Error ? error.message : String(error), true);
      } finally {
        setRunning(false);
      }
    },
    [draft, compare, request, say],
  );

  // Links: #ex=<example> loads an example; #s=<data> a shared program. Both run at once.
  useEffect(() => {
    const open = async () => {
      const hash = location.hash;
      const ex = /^#ex=([\w-]+)$/.exec(hash);
      if (ex) {
        const e = exampleById(ex[1]!);
        if (e) {
          const d = fromExample(e, draft.codeB);
          setDraft(d);
          void run(d, false);
        } else say("That example doesn't exist; here is the first one.", true);
        return;
      }
      try {
        const shared = await decode(hash);
        if (!shared) return;
        const d: Draft = { code: shared.code, codeB: shared.codeB ?? BRUTE_B, mode: shared.mode, stdin: shared.stdin, call: shared.call };
        setDraft(d);
        setCompare(shared.codeB !== undefined);
        void run(d, shared.codeB !== undefined);
      } catch (error) {
        say(error instanceof ShareError ? error.message : "This link could not be opened.", true);
      }
    };
    void open();
    // Only on first load: later hash changes come from our own share button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const length = Math.max(runA?.model.length ?? 0, compare && runB ? runB.model.length : 0);
  const stepA = runA ? Math.min(step, runA.model.length - 1) : 0;
  const stepB = runB ? Math.min(step, runB.model.length - 1) : 0;

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setStep((s) => {
        if (s >= length - 1) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, 1000 / speed);
    return () => clearInterval(t);
  }, [playing, speed, length]);

  // Announced politely when stepping, not on every tick of play.
  const nowStep = runA?.model.steps[stepA];
  const stepText = !playing && runA && nowStep ? `Step ${stepA + 1} of ${runA.model.length}${nowStep.e === "end" ? ", finished" : `, line ${nowStep.ln}`}.` : "";

  const goTo = useCallback((n: number | null, miss?: string) => {
    if (n === null) {
      if (miss) say(miss);
      return;
    }
    setPlaying(false);
    setStep(n);
  }, [say]);

  const share = useCallback(async () => {
    try {
      const fragment = await encode({ code: draft.code, mode: draft.mode, stdin: draft.stdin, call: draft.call, ...(compare ? { codeB: draft.codeB } : {}) });
      history.replaceState(null, "", `#${fragment}`);
      try {
        await navigator.clipboard.writeText(location.href);
        say("Link copied. Anyone who opens it sees this code and input.");
      } catch {
        say("Link ready in the address bar: copy it from there.");
      }
    } catch (error) {
      say(error instanceof Error ? error.message : String(error), true);
    }
  }, [draft, compare, say]);

  const toggleTheme = useCallback(() => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(dark ? "light" : "dark");
  }, []);

  const pickExample = (e: Example) => {
    setDialog(null);
    const d = fromExample(e, draft.codeB);
    setDraft(d);
    history.replaceState(null, "", `#ex=${e.id}`);
    void run(d);
  };

  const measureGrowth = async () => {
    const ns = sizes
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 100_000)
      .slice(0, 8);
    if (!ns.length) return say("Enter sizes as whole numbers, like 4 8 16 32.", true);
    setRunning(true);
    const points: GrowthPoint[] = [];
    try {
      for (const n of ns) {
        const d = { ...draft, stdin: draft.stdin.replaceAll("{n}", String(n)), call: draft.call.replaceAll("{n}", String(n)) };
        const opts = { record: false, limits: { max_steps: 200_000, max_seconds: 4, max_calls: 200_000 } };
        const ta = await engine.run({ ...request(draft.code, d), ...opts });
        const tb = await engine.run({ ...request(draft.codeB, d), ...opts });
        points.push({ n, a: ta.capped || ta.error ? null : ta.counts.steps, b: tb.capped || tb.error ? null : tb.counts.steps });
      }
      setGrowth(points);
    } catch (error) {
      say(error instanceof Error ? error.message : String(error), true);
    } finally {
      setRunning(false);
    }
  };

  // Keyboard shortcuts, everywhere outside the editor and form fields.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return; // the editor already handled it (its own Ctrl+Enter)
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void run();
      return;
    }
    const target = e.target as HTMLElement | null;
    if (dialog || e.ctrlKey || e.metaKey || e.altKey) return;
    // Events from the editor's shadow root arrive retargeted to its host, .editor.
    if (target?.closest(".editor, input, textarea, select, [contenteditable='true']")) {
      if (e.key === "Escape" && target.closest(".editor")) (document.querySelector(".run-btn") as HTMLElement | null)?.focus();
      return;
    }
    const model = runA?.model;
    const last = Math.max(0, length - 1);
    const handlers: Record<string, () => void> = {
      ArrowRight: () => model && goTo(Math.min(last, step + 1)),
      ArrowLeft: () => model && goTo(Math.max(0, step - 1)),
      " ": () => model && setPlaying((p) => !p),
      "]": () => model && goTo(nextCall(model, stepA), "No more calls after this step."),
      "[": () => model && goTo(prevCall(model, stepA), "No calls before this step."),
      Home: () => model && goTo(0),
      End: () => model && goTo(last),
      g: () => model && goTo(runToLine(model, stepA, cursorLine), `Line ${cursorLine} never runs.`),
      "+": () => setSpeed((s) => SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(s) + 1)]!),
      "=": () => setSpeed((s) => SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(s) + 1)]!),
      "-": () => setSpeed((s) => SPEEDS[Math.max(0, SPEEDS.indexOf(s) - 1)]!),
      e: () => (document.getElementById("editor-a")?.shadowRoot?.querySelector(".cm-content") as HTMLElement | null)?.focus(),
      o: () => setDialog("library"),
      c: () => setCompare((c) => !c),
      s: () => void share(),
      t: toggleTheme,
      "?": () => setDialog("keys"),
    };
    const h = handlers[e.key];
    if (h && !(e.key === " " && target?.closest("button, a"))) {
      e.preventDefault();
      h();
    }
  };
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const hits = useMemo(() => {
    if (!runA) return {};
    // Hits so far: the heatmap fills in as you step.
    const out: Record<string, number> = {};
    for (let i = 0; i <= stepA; i++) {
      const s = runA.model.steps[i]!;
      if (s.e === "l") out[String(s.ln)] = (out[String(s.ln)] ?? 0) + 1;
    }
    return out;
  }, [runA, stepA]);
  const hitsB = useMemo(() => {
    if (!runB) return {};
    const out: Record<string, number> = {};
    for (let i = 0; i <= stepB; i++) {
      const s = runB.model.steps[i]!;
      if (s.e === "l") out[String(s.ln)] = (out[String(s.ln)] ?? 0) + 1;
    }
    return out;
  }, [runB, stepB]);

  const staleA = runA !== null && runA.code !== draft.code;
  const currentLine = (r: Run | null, s: number) => {
    const st = r?.model.steps[s];
    return st && st.e !== "end" && r!.code === (r === runA ? draft.code : draft.codeB) ? st.ln : null;
  };
  const loading = status.state === "loading" ? status : null;
  const pct = loading ? Math.min(100, Math.round((loading.loaded / Math.max(1, loading.total)) * 100)) : 0;
  const placeholder = draft.mode === "call" ? "solve([2, 7, 11, 15], 9)" : "Input your program reads with input()";

  return (
    <div className={`app${compare ? " is-compare" : ""}`} data-tab={tab}>
      <a className="skip" href="#canvas">
        Skip to the dry run
      </a>
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="DryRun home">
          Dry<span>Run</span>
        </a>
        <nav className="top-actions" aria-label="Tools">
          <button className="btn" type="button" onClick={() => setDialog("library")} title="Pattern library (o)">
            <Icon name="book" />
            <span className="label">Library</span>
          </button>
          <button className="btn" type="button" aria-pressed={compare} onClick={() => setCompare((c) => !c)} title="Compare two solutions (c)">
            <Icon name="compare" />
            <span className="label">Compare</span>
          </button>
          <button className="btn" type="button" onClick={() => void share()} title="Copy a share link (s)">
            <Icon name="share" />
            <span className="label">Share</span>
          </button>
          <button className="icon-btn" type="button" onClick={toggleTheme} aria-label="Switch light or dark theme" title="Theme (t)">
            <Icon name="moon" className="icon only-light" />
            <Icon name="sun" className="icon only-dark" />
          </button>
          <button className="icon-btn" type="button" onClick={() => setDialog("keys")} aria-label="Keyboard shortcuts and hints" title="Shortcuts (?)">
            <Icon name="keyboard" />
          </button>
        </nav>
      </header>

      <div className="tabs" role="tablist" aria-label="Panels">
        <button role="tab" type="button" id="tab-code" aria-selected={tab === "code"} aria-controls="code-panel" onClick={() => setTab("code")}>
          Code
        </button>
        <button role="tab" type="button" id="tab-run" aria-selected={tab === "run"} aria-controls="canvas" onClick={() => setTab("run")}>
          Dry run
        </button>
      </div>

      <main className="workspace">
        <section className="code-panel" id="code-panel" aria-label="Code and input" role="tabpanel" aria-labelledby="tab-code">
          <div className="editor-block">
            <div className="block-head">
              <h2 id="code-a-title">{compare ? "Solution A" : "Your code"}</h2>
              {staleA && <span className="stale-note">edited since the last run</span>}
            </div>
            <Editor
              id="editor-a"
              label={compare ? "Solution A, Python code" : "Python code"}
              value={draft.code}
              onChange={(code) => update({ code })}
              current={currentLine(runA, stepA)}
              error={runA?.code === draft.code ? runA?.model.trace.error?.line ?? null : null}
              hits={runA?.code === draft.code ? hits : {}}
              onRunToLine={(line) => runA && goTo(runToLine(runA.model, stepA, line))}
              onCursorLine={setCursorLine}
              onRun={() => void run()}
            />
          </div>
          {compare && (
            <div className="editor-block">
              <div className="block-head">
                <h2>Solution B</h2>
              </div>
              <Editor
                id="editor-b"
                label="Solution B, Python code"
                value={draft.codeB}
                onChange={(codeB) => update({ codeB })}
                current={currentLine(runB, stepB)}
                error={runB?.code === draft.codeB ? runB?.model.trace.error?.line ?? null : null}
                hits={runB?.code === draft.codeB ? hitsB : {}}
                onRunToLine={(line) => runB && goTo(runToLine(runB.model, stepB, line))}
                onRun={() => void run()}
              />
            </div>
          )}
          <div className="input-block">
            <fieldset className="mode">
              <legend className="sr-only">How to run it</legend>
              <label>
                <input type="radio" name="mode" checked={draft.mode === "stdin"} onChange={() => update({ mode: "stdin" })} />
                Standard input
              </label>
              <label>
                <input type="radio" name="mode" checked={draft.mode === "call"} onChange={() => update({ mode: "call" })} />
                Call a function
              </label>
            </fieldset>
            {draft.mode === "stdin" ? (
              <textarea
                className="stdin"
                aria-label="Standard input"
                rows={3}
                spellCheck={false}
                value={draft.stdin}
                placeholder={placeholder}
                onChange={(e) => update({ stdin: e.target.value })}
              />
            ) : (
              <input
                className="call"
                aria-label="Function call"
                spellCheck={false}
                value={draft.call}
                placeholder={placeholder}
                onChange={(e) => update({ call: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && void run()}
              />
            )}
            <div className="run-row">
              <button className="btn btn-primary run-btn" type="button" onClick={() => void run()} disabled={running} aria-describedby="run-status">
                <Icon name="run" />
                {running ? "Running…" : compare ? "Run both" : "Run"}
              </button>
              <span id="run-status" className="run-status">
                {status.state === "loading" && `Loading Python, ${pct}%`}
                {status.state === "ready" && `Python ${status.version} ready, running in your browser`}
                {status.state === "failed" && `Python failed to load: ${status.message}`}
                <kbd className="kbd-hint">Ctrl</kbd>
                <kbd className="kbd-hint">Enter</kbd>
              </span>
            </div>
            {compare && (
              <div className="sizes">
                <label>
                  Sizes for <code>{"{n}"}</code> in the input
                  <input value={sizes} onChange={(e) => setSizes(e.target.value)} spellCheck={false} />
                </label>
                <button
                  className="btn"
                  type="button"
                  onClick={() => void measureGrowth()}
                  disabled={running || !(draft.mode === "call" ? draft.call : draft.stdin).includes("{n}")}
                >
                  <Icon name="chart" />
                  Measure growth
                </button>
                {!(draft.mode === "call" ? draft.call : draft.stdin).includes("{n}") && (
                  <p className="hint-text">
                    Put <code>{"{n}"}</code> in the input, like <code>{"pair_with_sum(list(range({n})), -1)"}</code>, to chart steps against n.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="canvas" id="canvas" tabIndex={-1} aria-label="Dry run" role="tabpanel" aria-labelledby="tab-run">
          {!runA && (
            <div className="welcome">
              {loading ? (
                <div className="loading">
                  <p>Loading Python for your browser. It's about 12 MB once, then cached for later visits and offline use.</p>
                  <div className="bar" role="progressbar" aria-label="Loading Python" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                    <span style={{ transform: `scaleX(${pct / 100})` }} />
                  </div>
                  <div className="skeleton" aria-hidden="true">
                    {Array.from({ length: 7 }, (_, i) => (
                      <span key={i} />
                    ))}
                  </div>
                </div>
              ) : (
                <p>
                  Press <b>Run</b> to trace the code, then step through it. Or open the <button className="link" type="button" onClick={() => setDialog("library")}>pattern library</button>.
                </p>
              )}
            </div>
          )}
          {runA && (
            <div className={compare && runB ? "sides" : "single"}>
              {compare && runB && <CompareTable a={runA.model} b={runB.model} />}
              {compare && growth && <GrowthChart points={growth} />}
              <div className="side">
                <Banner trace={runA.model.trace} which={compare && runB ? "A" : undefined} />
                <Canvas model={runA.model} views={runA.views} step={stepA} label={compare && runB ? "A" : undefined} />
                <div className="below">
                  <Frames model={runA.model} step={stepA} />
                  <Output trace={runA.model.trace} step={stepA} model={runA.model} />
                </div>
              </div>
              {compare && runB && (
                <div className="side">
                  <Banner trace={runB.model.trace} which="B" />
                  {step >= runB.model.length && <p className="view-note">B finished at step {runB.model.length}.</p>}
                  <Canvas model={runB.model} views={runB.views} step={stepB} label="B" />
                  <div className="below">
                    <Frames model={runB.model} step={stepB} />
                    <Output trace={runB.model.trace} step={stepB} model={runB.model} />
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      <footer className="dock">
        <Timeline
          model={runA?.model ?? null}
          length={length}
          step={step}
          setStep={(n) => goTo(n)}
          playing={playing}
          togglePlay={() => {
            if (!playing && step >= length - 1) setStep(0);
            setPlaying(!playing);
          }}
          speed={speed}
          setSpeed={setSpeed}
          onPrevCall={() => runA && goTo(prevCall(runA.model, stepA))}
          onNextCall={() => runA && goTo(nextCall(runA.model, stepA))}
          canPrevCall={!!runA && prevCall(runA.model, stepA) !== null}
          canNextCall={!!runA && nextCall(runA.model, stepA) !== null}
        />
      </footer>

      <p className="sr-only" aria-live="polite">
        {announce} {stepText}
      </p>
      {toast && (
        <div className={`toast${toast.error ? " is-error" : ""}`} role={toast.error ? "alert" : "status"}>
          {toast.text}
        </div>
      )}
      <LibraryDialog open={dialog === "library"} onClose={() => setDialog(null)} onPick={pickExample} />
      <KeysDialog open={dialog === "keys"} onClose={() => setDialog(null)} />
    </div>
  );
}
