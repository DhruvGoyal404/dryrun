// The scrubber: step controls, play/pause and speed, the slider, and the counters that are
// always visible (steps, calls, depth). Shortcuts live in App; titles name them.
import type { Model } from "../trace/model";
import { depthAt } from "../trace/navigate";
import { Icon } from "./Icon";

export const SPEEDS = [1, 2, 4, 8, 16];

export interface TimelineProps {
  model: Model | null;
  length: number;
  step: number;
  setStep: (n: number) => void;
  playing: boolean;
  togglePlay: () => void;
  speed: number;
  setSpeed: (n: number) => void;
  onPrevCall: () => void;
  onNextCall: () => void;
  canPrevCall: boolean;
  canNextCall: boolean;
}

export function Timeline(p: TimelineProps) {
  const disabled = !p.model || p.length === 0;
  const last = Math.max(0, p.length - 1);
  const s = p.model?.steps[Math.min(p.step, p.model.length - 1)];
  const counts = p.model?.trace.counts;
  const event = !s ? "" : s.e === "c" ? "a call at" : s.e === "r" ? "a return at" : s.e === "x" ? "an exception at" : s.e === "end" ? "finished" : "about to run";
  return (
    <div className="timeline" role="group" aria-label="Replay">
      <div className="transport">
        <button className="icon-btn" type="button" onClick={() => p.setStep(0)} disabled={disabled || p.step === 0} aria-label="First step" title="First step (Home)">
          <Icon name="first" />
        </button>
        <button className="icon-btn" type="button" onClick={p.onPrevCall} disabled={disabled || !p.canPrevCall} aria-label="Previous call" title="Previous call ([)">
          <Icon name="prevCall" />
        </button>
        <button className="icon-btn" type="button" onClick={() => p.setStep(Math.max(0, p.step - 1))} disabled={disabled || p.step === 0} aria-label="Step back" title="Step back (←)">
          <Icon name="back" />
        </button>
        <button className="icon-btn play" type="button" onClick={p.togglePlay} disabled={disabled} aria-label={p.playing ? "Pause" : "Play"} title="Play or pause (Space)">
          <Icon name={p.playing ? "pause" : "play"} />
        </button>
        <button className="icon-btn" type="button" onClick={() => p.setStep(Math.min(last, p.step + 1))} disabled={disabled || p.step >= last} aria-label="Step forward" title="Step forward (→)">
          <Icon name="forward" />
        </button>
        <button className="icon-btn" type="button" onClick={p.onNextCall} disabled={disabled || !p.canNextCall} aria-label="Next call" title="Next call (])">
          <Icon name="nextCall" />
        </button>
        <button className="icon-btn" type="button" onClick={() => p.setStep(last)} disabled={disabled || p.step >= last} aria-label="Last step" title="Last step (End)">
          <Icon name="last" />
        </button>
        <label className="speed">
          <span className="sr-only">Speed</span>
          <select value={p.speed} onChange={(e) => p.setSpeed(Number(e.target.value))} disabled={disabled} title="Speed (+ and -)">
            {SPEEDS.map((n) => (
              <option key={n} value={n}>
                {n} step{n > 1 ? "s" : ""}/s
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="scrub">
        <input
          type="range"
          min={0}
          max={last}
          value={Math.min(p.step, last)}
          onChange={(e) => p.setStep(Number(e.target.value))}
          disabled={disabled}
          aria-label="Step"
          aria-valuetext={s ? `Step ${p.step + 1} of ${p.length}, line ${s.ln}` : "No trace yet"}
        />
        <p className="where" aria-hidden="true">
          {disabled ? (
            "Run the code to start the dry run"
          ) : (
            <>
              step <b>{p.step + 1}</b> of {p.length}
              {s && s.e !== "end" && (
                <>
                  , {event} line <b>{s.ln}</b>
                </>
              )}
              {s?.e === "end" && ", finished"}
            </>
          )}
        </p>
      </div>
      <dl className="counters">
        <div>
          <dt>steps</dt>
          <dd>{counts?.steps ?? 0}</dd>
        </div>
        <div>
          <dt>calls</dt>
          <dd>{counts?.calls ?? 0}</dd>
        </div>
        <div>
          <dt>max depth</dt>
          <dd>{counts?.maxDepth ?? 0}</dd>
        </div>
        <div>
          <dt>depth now</dt>
          <dd>{p.model && s ? depthAt(p.model, Math.min(p.step, p.model.length - 1)) : 0}</dd>
        </div>
      </dl>
    </div>
  );
}
