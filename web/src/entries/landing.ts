// The landing and 404 pages: styles, two faces, and the service worker. No other script.
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource-variable/caveat";
import "@fontsource-variable/jetbrains-mono";
import "../styles/tokens.css";
import "../styles/base.css";
import "../styles/landing.css";
import { registerServiceWorker } from "./sw";

registerServiceWorker();

// The hero's one moment: step through the three times the real trace reaches line 11 of the
// two-pointer example (pair_with_sum([1, 3, 4, 6, 8, 11, 15], 14)). The values are the
// tracer's own: steps 8, 13 and 18 of 20. The button stays hidden without JavaScript.
const FRAMES = [
  { step: 8, left: 0, right: 6, total: 16, note: "1 + 15 is 16, too big: right moves left" },
  { step: 13, left: 0, right: 5, total: 12, note: "1 + 11 is 12, too small: left moves right" },
  { step: 18, left: 1, right: 5, total: 14, note: "3 + 11 is 14, the pair is found" },
];
const button = document.getElementById("hero-step");
if (button) {
  let at = FRAMES.length - 1;
  const cellX = (i: number) => 4 + i * 40;
  const show = () => {
    const f = FRAMES[at]!;
    for (const [id, i] of [["hero-left", f.left], ["hero-right", f.right]] as const) {
      const g = document.getElementById(id) as unknown as SVGGElement | null;
      g?.style.setProperty("transform", `translateX(${i * 40}px)`);
    }
    document.getElementById("hero-win")?.setAttribute("x", String(cellX(f.left)));
    document.getElementById("hero-win")?.setAttribute("width", String((f.right - f.left + 1) * 40));
    document.getElementById("hero-rd-left")?.setAttribute("x", String(cellX(f.left)));
    document.getElementById("hero-rd-right")?.setAttribute("x", String(cellX(f.right)));
    document.getElementById("hero-total")!.textContent = String(f.total);
    document.getElementById("hero-caption")!.textContent = `Step ${f.step}, about to run line 11: ${f.note}.`;
  };
  button.hidden = false;
  button.addEventListener("click", () => {
    at = (at + 1) % FRAMES.length;
    show();
  });
}
