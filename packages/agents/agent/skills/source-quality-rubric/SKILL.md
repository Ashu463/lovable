---
name: source-quality-rubric
description: How to weigh and cite sources when compiling research findings — recency, authority, and corroboration. Use whenever evaluating search/scrape results before including them in a research report, not just when a source looks obviously unreliable.
---

# Source Quality Rubric

`report-format` defines the output shape (including a per-finding
`confidence` field) — this skill is how that confidence value actually gets
decided, rather than guessed.

## Weighting a source

Judge each source on three axes:

- **Authority** — is this the primary/official source (library docs, spec,
  vendor changelog) or a secondary discussion of it (blog post, forum
  answer, aggregator)? Primary sources outrank secondary ones on factual
  claims about how something works.
- **Recency** — for anything version- or API-dependent, a source's age
  matters more than its authority. A two-year-old blog post about a fast-
  moving library's API is worse evidence than this week's official docs,
  even though both are nominally "reputable."
- **Corroboration** — a claim repeated independently across multiple
  unrelated sources is stronger evidence than the same claim appearing once,
  even on an authoritative site. One source, however good, is thin evidence
  for anything non-trivial.

## Mapping to confidence

- **high** — primary/official source, current, or corroborated by 2+
  independent sources.
- **medium** — a single reputable secondary source, or a primary source of
  uncertain currency.
- **low** — a single secondary source, anything user-generated/unverified
  (forum post, comment thread), or a claim that conflicts with another
  source and wasn't resolved.

## Rules

- Never report a claim as `high` confidence off a single secondary source,
  regardless of how authoritative-sounding the site is.
- When sources conflict, say so explicitly rather than silently picking one
  — report both positions and mark confidence `low` unless one side is
  clearly the primary source.
- Prefer the source closest to the thing being asked about (a library's own
  docs over a tutorial about the library) when both are available.

## Do not

- Cite a source you didn't actually read the content of, just the title/
  snippet.
- Inflate confidence because a finding is convenient or matches what was
  expected — the rubric applies the same regardless of what the finding is.
