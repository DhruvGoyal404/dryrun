// The two dialogs: the pattern library and the keyboard shortcuts. Native <dialog>, so focus
// is trapped and Escape closes them without any code of ours.
import { useEffect, useRef, type ReactNode } from "react";
import { EXAMPLES, type Example } from "../library";
import { Icon } from "./Icon";

function Dialog({ open, onClose, title, children, id }: { open: boolean; onClose: () => void; title: string; children: ReactNode; id: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closed = useRef(onClose);
  useEffect(() => {
    closed.current = onClose;
  });
  // The native close event (Escape, the close button, a backdrop click), listened to directly.
  useEffect(() => {
    const d = ref.current!;
    const handler = () => closed.current();
    d.addEventListener("close", handler);
    return () => d.removeEventListener("close", handler);
  }, []);
  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby={`${id}-title`} onClick={(e) => e.target === ref.current && ref.current.close()}>
      <div className="dialog-head">
        <h2 id={`${id}-title`}>{title}</h2>
        <button className="icon-btn" type="button" onClick={() => ref.current?.close()} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}

export function LibraryDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (e: Example) => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Pattern library" id="library">
      <p className="dialog-lede">Twenty short programs, one per pattern. Pick one to load it and run it.</p>
      <ul className="library">
        {EXAMPLES.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => onPick(e)} data-example={e.id}>
              <span className="lib-title">{e.title}</span>
              <span className="lib-pattern">{e.pattern}</span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

const KEYS: [string[], string][] = [
  [["Ctrl", "Enter"], "Run (works in the editor too)"],
  [["→"], "Step forward"],
  [["←"], "Step back"],
  [["Space"], "Play or pause"],
  [["]"], "Next call"],
  [["["], "Previous call"],
  [["Home"], "First step"],
  [["End"], "Last step"],
  [["g"], "Run to the line the editor cursor is on"],
  [["+"], "Faster"],
  [["-"], "Slower"],
  [["e"], "Focus the editor"],
  [["Esc"], "Leave the editor, close a dialog"],
  [["o"], "Open the pattern library"],
  [["c"], "Compare mode on or off"],
  [["s"], "Copy a share link"],
  [["t"], "Light or dark theme"],
  [["?"], "This list"],
];

export function KeysDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" id="keys">
      <p className="dialog-lede">Shortcuts work anywhere outside the editor and the input boxes. On a Mac, Ctrl is Cmd.</p>
      <table className="keys">
        <tbody>
          {KEYS.map(([keys, what]) => (
            <tr key={what}>
              <th scope="row">
                {keys.map((k, i) => (
                  <span key={k}>
                    {i > 0 && " + "}
                    <kbd>{k}</kbd>
                  </span>
                ))}
              </th>
              <td>{what}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="dialog-sub">Hints in your code</h3>
      <p className="dialog-lede">
        DryRun guesses how to draw each variable from what your code does with it. A comment overrides the guess:
      </p>
      <ul className="hints">
        <li>
          <code># dryrun: grid dp</code> draws <code>dp</code> as a table
        </li>
        <li>
          <code># dryrun: array nums lo hi</code> draws <code>nums</code> with <code>lo</code> and <code>hi</code> as pointers
        </li>
        <li>
          <code># dryrun: tree root</code>, <code>linked head</code>, <code>graph adj seen</code>, <code>stack st</code>, <code>queue q</code>,{" "}
          <code>heap h</code>, <code>map m</code>, <code>set s</code>
        </li>
        <li>
          <code># dryrun: hide tmp</code> leaves <code>tmp</code> out
        </li>
      </ul>
    </Dialog>
  );
}
