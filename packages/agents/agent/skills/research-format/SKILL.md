---
name: report-format
description: Fixed output schema for research findings so the orchestrator and other agents can parse them deterministically. Use whenever compiling or returning any research result, regardless of the research topic.
---

# Report Format

The orchestrator consumes research output programmatically. Free-form prose
summaries are harder to parse reliably and should be avoided in favor of
this structure.

## Required output shape

```json
{
  "query": "<the research question actually addressed>",
  "findings": [
    {
      "claim": "<a single specific finding, plain statement>",
      "confidence": "high | medium | low",
      "source": "<where this came from — name or URL>"
    }
  ],
  "unresolved": [
    "<anything the research could not determine>"
  ],
  "recommendation": "<one paragraph, only if the task asked for a
    recommendation rather than pure findings>"
}
```

## Rules

- Each `finding` is one claim, not a paragraph bundling several. Split
  bundled findings into separate entries so downstream agents can act on
  them individually.
- `confidence: high` only for claims backed by an authoritative or
  primary source. Aggregator/forum-sourced claims are `medium` at best.
- List genuinely unresolved questions in `unresolved` rather than silently
  omitting them or papering over the gap with a guess.
- Do not include a `recommendation` field unless the task explicitly asked
  for one — pure fact-finding tasks should stop at `findings`.

## Do not

- Return a narrative summary instead of the structured shape.
- Merge multiple distinct claims into one `finding` entry.
- State a claim without a `source` — if there's no source, it doesn't
  belong in `findings`.