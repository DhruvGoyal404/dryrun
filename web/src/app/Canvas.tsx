// The right-hand page: one drawing per detected structure, then the frames (call stack and
// every variable, the fallback for anything not drawn), then the program's output so far.
import type { View } from "../detect/detect";
import { show } from "../trace/format";
import type { Model } from "../trace/model";
import type { Trace } from "../trace/types";
import { type Scene } from "./views/common";
import { GraphView, LinkedView, RecursionView, TreeView } from "./views/NodeViews";
import { ArrayView, GridView, HeapView, MapView, SetView, StackQueueView } from "./views/SequenceViews";

function ViewFor({ view, scene }: { view: View; scene: Scene }) {
  switch (view.kind) {
    case "array":
      return <ArrayView view={view} scene={scene} />;
    case "grid":
      return <GridView view={view} scene={scene} />;
    case "stack":
    case "queue":
      return <StackQueueView view={view} scene={scene} />;
    case "map":
      return <MapView view={view} scene={scene} />;
    case "set":
      return <SetView view={view} scene={scene} />;
    case "heap":
      return <HeapView view={view} scene={scene} />;
    case "linked":
      return <LinkedView view={view} scene={scene} />;
    case "tree":
      return <TreeView view={view} scene={scene} />;
    case "graph":
      return <GraphView view={view} scene={scene} />;
    case "recursion":
      return <RecursionView view={view} scene={scene} />;
  }
}

export function Frames({ model, step }: { model: Model; step: number }) {
  const stack = model.stack(step);
  const globals = Object.entries(model.globals(step));
  const frames = stack.filter((cid) => !model.calls[cid]?.kind).reverse();
  const current = model.steps[step];
  return (
    <section className="frames" aria-labelledby="frames-title">
      <h3 id="frames-title">Frames</h3>
      {current?.e === "end" && current.r !== undefined && (
        <p className="returned">
          returned <code>{show(current.r, model, step, 3)}</code>
        </p>
      )}
      {frames.length === 0 && globals.length === 0 && <p className="empty">No variables yet.</p>}
      {frames.map((cid, i) => {
        const locals = Object.entries(model.locals(cid, step) ?? {});
        const call = model.calls[cid]!;
        return (
          <div key={cid} className={i === 0 ? "frame is-current" : "frame"}>
            <p className="frame-name">
              <code>{call.fn}</code>
              <span>depth {call.d}</span>
            </p>
            <dl className="vars">
              {locals.map(([name, v]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{show(v, model, step, 2)}</dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
      {globals.length > 0 && (
        <div className="frame">
          <p className="frame-name">
            <code>globals</code>
          </p>
          <dl className="vars">
            {globals.map(([name, v]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{show(v, model, step, 2)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}

export function Output({ trace, step, model }: { trace: Trace; step: number; model: Model }) {
  const upTo = model.steps[step]?.o ?? 0;
  const text = trace.stdout.slice(0, upTo);
  return (
    <section className="output" aria-labelledby="output-title">
      <h3 id="output-title">Output so far</h3>
      {text ? <pre>{text}</pre> : <p className="empty">Nothing printed yet.</p>}
    </section>
  );
}

export function Canvas({ model, views, step, label }: { model: Model; views: View[]; step: number; label?: string }) {
  const scene = { model, step };
  return (
    <div className="canvas-inner">
      {label && <h2 className="canvas-label hand">{label}</h2>}
      {views.length === 0 && (
        <p className="no-views">
          Nothing to draw: no arrays, tables, lists, trees, graphs or recursion here. The variables are listed under Frames. A
          comment like <code># dryrun: array nums</code> asks for a drawing.
        </p>
      )}
      {views.map((v) => (
        <ViewFor key={`${v.kind}:${v.scope}:${v.name}`} view={v} scene={scene} />
      ))}
    </div>
  );
}
