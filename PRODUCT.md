# DryRun: product

Written from the owner's brief, without an interview (the brief asked for no stops).
Assumptions are marked.

## Who it's for

- **Students practising DSA** (the owner is one): they write a solution, it gives a wrong
  answer, and they want to see what their code actually did, the way a teacher does a dry
  run on paper with a table of variables and arrows under an array.
- **Interviewers and reviewers** looking at the owner's portfolio: they open the site cold,
  click an example, and should understand in ten seconds that the drawings come from
  tracing real Python, not from canned animations.
- *Assumption:* most sessions start from a library example or a pasted solution of 10 to
  40 lines with a small input, on a laptop; a minority on a phone, to show someone.

## What it must do

- Run the user's own code, unmodified, with their input, and draw what it did. No
  special API to call, no annotations required; a comment hint is an optional override.
- Make the step-by-step story legible: the line about to run, what it read and wrote, and
  how each structure changed, forward and backward in time.
- Be honest about limits: when a trace is capped, say where and why.
- Cost nothing to run: static site, code runs in the visitor's browser.

## Principles

1. **Paper first.** Draw structures as a person would on paper: boxes, arrows, a table
   filling in. No 3D, no particle effects, no chart junk.
2. **The code is the source of truth.** Every highlight traces to an event the tracer
   recorded. Nothing is invented or interpolated.
3. **Calm at rest, precise in motion.** The canvas changes only when the step changes;
   motion shows what moved, and stops when reduced motion is asked for.
4. **Keyboard is first-class.** Every control has a shortcut; stepping through a trace is
   a keyboard activity.

## Surfaces

| Surface | Mode | Job |
|---|---|---|
| `/` landing | Persuade | Show what a dry run looks like and get the visitor into the app with an example loaded. Static HTML, fast. |
| `/app` | Operate | Edit, run, scrub, compare, share. Dense, precise, keyboard-driven. |
| `/404` | Read | Say the page doesn't exist and point home. |
