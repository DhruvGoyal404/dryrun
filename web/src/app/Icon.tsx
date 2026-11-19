// One icon set, drawn here: 24-unit grid, 1.75 stroke, round caps. Decorative by default;
// the button that holds an icon carries the accessible name.
const PATHS = {
  play: "M7 5v14l12-7z",
  pause: "M8 5v14M16 5v14",
  back: "M15 6l-6 6 6 6",
  forward: "M9 6l6 6-6 6",
  first: "M7 5v14M17 6l-6 6 6 6",
  last: "M17 5v14M7 6l6 6-6 6",
  prevCall: "M18 6l-6 6 6 6M11 6l-6 6 6 6",
  nextCall: "M6 6l6 6-6 6M13 6l6 6-6 6",
  share: "M8.6 13.5l6.8 4M15.4 6.5l-6.8 4M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  keyboard: "M3 7h18v11H3zM7 11h.01M11 11h.01M15 11h.01M7 14.5h10",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7",
  compare: "M4 4h7v16H4zM13 4h7v16h-7z",
  close: "M6 6l12 12M18 6L6 18",
  run: "M7 5v14l12-7z",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  chart: "M4 20V4M4 20h16M7 16l4-5 3 3 5-7",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "icon" }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
