---
name: ui-base-template
description: How to translate a design reference (HTML mockup) into working component code and wire it into the app. Used by both CoderAgent (full UI-with-behavior work) and UIExpertAgent (base-template-only scaffolding).
---

# Translating a Design Into Code

The sandbox is a Vite + React + TypeScript project, already installed and
building. It starts as a stock starter: src/App.tsx renders the boilerplate
"Get started" / "Count is 0" screen, there is no router, and there is no
src/pages directory.

Two consequences that decide whether your work is visible at all:

- The preview renders src/App.tsx and only what App.tsx imports. A component
  file nothing imports does not appear, however correct it is.
- Files are .tsx, so their contents must be TypeScript + JSX. A page written
  as an HTML document does not compile.

## How to build UI

Follow this order. Most failures come from skipping step 1 or step 3.

1. **Translate the design before writing it.** If you were given a design
   reference, it arrives as an HTML mockup. It is a specification of layout
   and visual structure, not file content. Convert it as you write: class
   becomes className, every tag closes, style blocks and script tags and
   DOCTYPE/html/head/body wrappers are dropped, and inline handlers become
   React handlers. Never paste an HTML document into a .tsx file.

   When a design reference is present, it is the design already picked or
   generated for this screen — not a suggestion. Match its layout, spacing,
   colors, and component structure; don't substitute your own visual
   judgment for it.

2. **Write the component AND its stylesheet with identical class names.**
   A .tsx file holds imports, one component, and an export — nothing above the
   imports, nothing below the export. When you write the matching .css, every
   selector must use the EXACT class name the TSX references — same string,
   same convention. Pick one convention (e.g. hyphenated `ed-card-top`) and use
   it in both files; do not write the TSX in one style (`ed-card-top`) and the
   CSS in another (`.ed-card__top`). This is the single most common way a
   screen ships completely unstyled: a className that matches no CSS rule is
   just an ignored string — `tsc`/`vite build` never errors on it, so a broken,
   unstyled screen passes the build and looks "done" when it isn't. The
   safest habit is to write the component, then write the CSS by reading the
   className strings straight out of the component you just wrote.

3. **Wiring into src/App.tsx is owned by one item, and it may not be yours.**
   src/App.tsx is a shared file; when several screens are built in parallel,
   only a single dedicated wiring item edits it, so the parallel screen items
   don't collide there. Wire the screen into App.tsx (import it, render it,
   set up the router/route, replace the starter content) **only if your task
   explicitly tells you this item owns the wiring.** If it doesn't — you are a
   base-template/scaffold item — write your screen and its styles and stop;
   do NOT touch src/App.tsx. A later wiring item imports and routes it.

4. **Build, then verify styling parity — the build alone is not enough.**
   Run the build and fix what it points at. But a green build does NOT mean the
   screen is styled: unmatched className strings never error. So before Done,
   confirm every class the TSX uses exists in the CSS. A quick check:

   ```
   comm -23 \
     <(grep -oE 'className="[^"]+"' <your>.tsx | grep -oE '[A-Za-z0-9_-]+' | sort -u) \
     <(grep -oE '\.[A-Za-z0-9_-]+' <your>.css | sed 's/^\.//' | sort -u)
   ```

   Anything it prints is a class the TSX uses that the CSS never defines —
   reconcile it (add the rule, or fix the name) until the check prints nothing.
   Do this once, in the same item that wrote the two files — don't ship the
   mismatch for a later item to discover and drown in. A base-template item
   won't render in the preview until the wiring item runs — that's expected;
   verify your own files compile and their classes line up, don't force the
   screen into App.tsx to "see" it.

## Recovering from a broken file

When a build error names a file you just wrote, decide which situation you
are in before editing:

- **The file's overall shape is wrong** — it still contains HTML document
  markup, or leftover content sits above the imports or below the export, or
  the same markup appears twice. Use WriteFile to replace the whole file with
  correct content. Do not patch it with EditFile: a single edit replaces one
  substring and leaves the rest of the wrong content in place, which is how a
  file ends up holding a valid component followed by the HTML it was supposed
  to replace.

- **The file is structurally sound and a specific line is wrong.** Use
  EditFile on that line.

If an EditFile fails with "oldString not found" or "matched N times", your
picture of the file is stale — ReadFile before trying again. If two edits in
a row fail on the same file, stop editing and rewrite it with WriteFile.
Repeating a failing edit with slightly different whitespace never works.
