import { Fragment } from "react";
import { cn } from "@/lib/utils";

// Inline formatting: **bold**, *italic*, `code`. Split on all three at once so
// the pieces stay in order, then re-wrap each match in its element.
function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={i} className="rounded bg-surface px-1 py-0.5 font-mono text-[0.85em] text-foreground">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

// Enough markdown for agent summaries — headings, bullet and numbered lists,
// paragraphs. Not a full parser: no tables, blockquotes, or fenced blocks.
export function Markdown({ content, className }: { content: string; className?: string }) {
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag
        key={`list-${blocks.length}`}
        className={cn("ml-4 flex flex-col gap-1", list.ordered ? "list-decimal" : "list-disc")}
      >
        {list.items.map((item, i) => (
          <li key={i} className="pl-1 marker:text-muted">
            {inline(item)}
          </li>
        ))}
      </Tag>,
    );
    list = null;
  };

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushList();
      blocks.push(
        <p key={`h-${blocks.length}`} className="pt-1 font-semibold text-foreground">
          {inline(heading[2]!)}
        </p>,
      );
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      // A bullet directly after a numbered list starts a new list, not a
      // continuation of it.
      if (list?.ordered) flushList();
      list ??= { ordered: false, items: [] };
      list.items.push(bullet[1]!);
      continue;
    }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (numbered) {
      if (list && !list.ordered) flushList();
      list ??= { ordered: true, items: [] };
      list.items.push(numbered[1]!);
      continue;
    }

    flushList();
    blocks.push(<p key={`p-${blocks.length}`}>{inline(trimmed)}</p>);
  }
  flushList();

  return <div className={cn("flex flex-col gap-2", className)}>{blocks}</div>;
}
