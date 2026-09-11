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

2. **Write the component.** A .tsx file holds imports, one component, and an
   export — nothing above the imports, nothing below the export.

3. **Wiring into src/App.tsx is owned by one item, and it may not be yours.**
   src/App.tsx is a shared file; when several screens are built in parallel,
   only a single dedicated wiring item edits it, so the parallel screen items
   don't collide there. Wire the screen into App.tsx (import it, render it,
   set up the router/route, replace the starter content) **only if your task
   explicitly tells you this item owns the wiring.** If it doesn't — you are a
   base-template/scaffold item — write your screen and its styles and stop;
   do NOT touch src/App.tsx. A later wiring item imports and routes it.

4. **Build, and read the errors.** Fix what they point at, then build again.
   A base-template item won't render in the preview until the wiring item
   runs — that's expected; verify your own file compiles, don't force it into
   App.tsx to "see" it.

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
