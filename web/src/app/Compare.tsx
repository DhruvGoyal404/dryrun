// Compare mode's summary: the two runs' counters side by side, and, when the input has an
// {n} placeholder, how the step count grows with n for each solution.
import type { Model } from "../trace/model";

export interface GrowthPoint {
  n: number;
  a: number | null;
  b: number | null;
}

function Row({ label, a, b }: { label: string; a: number; b: number }) {
  const ratio = a && b ? (a > b ? `${(a / b).toFixed(a / b >= 10 ? 0 : 1)}× more in A` : a < b ? `${(b / a).toFixed(b / a >= 10 ? 0 : 1)}× more in B` : "same") : "";
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{a.toLocaleString("en")}</td>
      <td>{b.toLocaleString("en")}</td>
      <td className="ratio">{ratio}</td>
    </tr>
  );
}

function ops(model: Model) {
  let n = 0;
  for (const s of model.steps) n += (s.rd?.length ?? 0) + (s.wr?.length ?? 0) + (s.ops?.length ?? 0);
  return n;
}

export function CompareTable({ a, b }: { a: Model; b: Model }) {
  const ca = a.trace.counts;
  const cb = b.trace.counts;
  return (
    <table className="compare-table">
      <caption>A and B on the same input</caption>
      <thead>
        <tr>
          <td />
          <th scope="col">A</th>
          <th scope="col">B</th>
          <td />
        </tr>
      </thead>
      <tbody>
        <Row label="steps" a={ca.steps} b={cb.steps} />
        <Row label="calls" a={ca.calls} b={cb.calls} />
        <Row label="max depth" a={ca.maxDepth} b={cb.maxDepth} />
        <Row label="structure operations" a={ops(a)} b={ops(b)} />
      </tbody>
    </table>
  );
}

export function GrowthChart({ points }: { points: GrowthPoint[] }) {
  const W = 420;
  const H = 220;
  const pad = { l: 56, r: 72, t: 16, b: 36 };
  const max = Math.max(1, ...points.flatMap((p) => [p.a ?? 0, p.b ?? 0]));
  const ns = points.map((p) => p.n);
  const nMin = Math.min(...ns);
  const nMax = Math.max(...ns);
  const x = (n: number) => pad.l + (nMax === nMin ? 0.5 : (n - nMin) / (nMax - nMin)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const line = (key: "a" | "b") =>
    points
      .filter((p) => p[key] !== null)
      .map((p, i) => `${i ? "L" : "M"}${x(p.n).toFixed(1)} ${y(p[key]!).toFixed(1)}`)
      .join(" ");
  const lastOf = (key: "a" | "b") => [...points].reverse().find((p) => p[key] !== null);
  const la = lastOf("a");
  const lb = lastOf("b");
  return (
    <figure className="growth">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="growth-cap">
        <line className="axis" x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} />
        <line className="axis" x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} />
        {[0, 0.5, 1].map((f) => (
          <text key={f} className="tick" x={pad.l - 8} y={y(max * f)} dy="0.35em" textAnchor="end">
            {Math.round(max * f).toLocaleString("en")}
          </text>
        ))}
        {points.map((p) => (
          <text key={p.n} className="tick" x={x(p.n)} y={H - pad.b + 18} textAnchor="middle">
            {p.n}
          </text>
        ))}
        <path className="series-a" d={line("a")} />
        <path className="series-b" d={line("b")} />
        {points.map((p) => p.a !== null && <circle key={`a${p.n}`} className="dot-a" cx={x(p.n)} cy={y(p.a)} r="3.5" />)}
        {points.map((p) => p.b !== null && <rect key={`b${p.n}`} className="dot-b" x={x(p.n) - 3.5} y={y(p.b) - 3.5} width="7" height="7" />)}
        {la && (
          <text className="series-label-a hand" x={x(la.n) + 8} y={y(la.a!)} dy="0.35em">
            A
          </text>
        )}
        {lb && (
          <text className="series-label-b hand" x={x(lb.n) + 8} y={y(lb.b!)} dy="0.35em">
            B
          </text>
        )}
        <text className="tick" x={(W - pad.r + pad.l) / 2} y={H - 4} textAnchor="middle">
          n
        </text>
      </svg>
      <figcaption id="growth-cap">
        Steps as n grows. {points.map((p) => `n = ${p.n}: A ${p.a ?? "capped"}, B ${p.b ?? "capped"}`).join("; ")}.
      </figcaption>
    </figure>
  );
}
