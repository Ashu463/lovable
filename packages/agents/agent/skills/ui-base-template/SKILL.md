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
   and component structure exactly.

   Colors and typography need one extra step. The design's class names
   include ones like `bg-surface`, `bg-primary-container`, `text-outline`,
   `text-headline-xl` — these look like Tailwind but are NOT real Tailwind
   utilities. They only rendered in the design tool because a color/type
   dictionary defining them shipped alongside that one mockup; this sandbox
   does not have that dictionary, so copying those names literally produces
   invisible, unstyled elements — the build stays green, nothing errors, and
   it looks done when it isn't. Translate anything shaped like a semantic
   token into a real Tailwind utility that achieves the same visual intent:
   a dark near-black background reads as `bg-neutral-950` or `bg-zinc-900`,
   not `bg-surface`; an accent/brand color reads as `bg-indigo-500` /
   `text-indigo-400` or similar, not `bg-primary` / `text-primary`. Standard
   Tailwind utilities (`flex`, `p-4`, `rounded-lg`, `bg-white`,
   `text-gray-900`, `shadow-md`, and all layout/spacing/sizing classes) ARE
   real and work as-is — only the design-tool-specific names (surface /
   primary / secondary / tertiary variants, any `*-container` suffix, and
   the headline- / body- / label- / display- type scale) need substituting.

2. **A component is one file: the .tsx, styled entirely with className.**
   There is no separate stylesheet to write — Tailwind utility classes on
   className ARE the styling. A .tsx file holds imports, one component, and
   an export — nothing above the imports, nothing below the export.

3. **Wiring into src/App.tsx is owned by one item, and it may not be yours.**
   src/App.tsx is a shared file; when several screens are built in parallel,
   only a single dedicated wiring item edits it, so the parallel screen items
   don't collide there. Wire the screen into App.tsx (import it, render it,
   set up the router/route, replace the starter content) **only if your task
   explicitly tells you this item owns the wiring.** If it doesn't — you are a
   base-template/scaffold item — write your screen and its styles and stop;
   do NOT touch src/App.tsx. A later wiring item imports and routes it.

4. **Build, then verify no design-tool tokens leaked through — the build
   alone is not enough.** Run the build and fix what it points at. But a
   green build does NOT mean the screen is styled: an unresolvable className
   never errors, tsc/vite just ignore the string. Before Done, re-scan the
   file you wrote for anything still shaped like a design-tool token rather
   than a real Tailwind utility — surface / primary / secondary / tertiary /
   outline variants, any `*-container` suffix, and the headline- / body- /
   label- / display- type scale are the ones to catch. A quick check:

   ```
   grep -oE 'className="[^"]+"' <your>.tsx | \
     grep -E 'bg-(surface|primary|secondary|tertiary|on-)|text-(surface|primary|secondary|tertiary|on-|outline)|-container|text-(headline|body|label|display)-'
   ```

   Anything it prints is a token you copied instead of translated — go back
   to step 1 and substitute the real Tailwind utility. Do this once, in the
   same item that wrote the file — don't ship the mismatch for a later item
   to discover and drown in. A base-template item won't render in the
   preview until the wiring item runs — that's expected; verify your own
   file compiles and is free of untranslated tokens, don't force the screen
   into App.tsx to "see" it.

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
