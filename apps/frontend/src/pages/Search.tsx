import { useEffect, useState } from "react";
import { SearchIcon } from "lucide-react";
import { PageShell } from "@/features/shell/PageShell";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { gql, GqlError } from "@/lib/graphql";
import { useOpenProject } from "@/lib/useOpenProject";
import { cn } from "@/lib/utils";
import PROJECTS from "@/graphql/projectsSummary.graphql?raw";

interface ProjectRow {
  id: string;
  title: string;
  latestRunId: string | null;
  createdAt: string;
}

export function Search() {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const { openProject, openingId, openError } = useOpenProject();

  useEffect(() => {
    gql<{ projects: ProjectRow[] }>(PROJECTS)
      .then((res) => setProjects(res.projects))
      .catch((err) => setError(err instanceof GqlError ? err.message : "Failed to load projects."));
  }, []);

  const results = (projects ?? []).filter((p) =>
    p.title.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <PageShell title="Search" subtitle="Search across your own projects by name.">
      <div className="relative mb-8 max-w-md">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your projects…"
          className="pl-9 font-mono text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {!error && !projects && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!error && projects && results.length === 0 && (
        <p className="text-sm text-muted-foreground">No matching projects.</p>
      )}

      {openError && <p className="mb-4 text-sm text-red-400">{openError}</p>}

      <div className="space-y-2">
        {results.map((p) => (
          <Card
            key={p.id}
            role="button"
            tabIndex={0}
            onClick={() => void openProject(p)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                void openProject(p);
              }
            }}
            className={cn(
              "flex cursor-pointer items-center justify-between px-4 py-3 transition-colors hover:bg-surface-hover",
              openingId === p.id && "pointer-events-none opacity-60",
            )}
          >
            <p className="truncate font-medium">{p.title}</p>
            <p className="shrink-0 pl-4 font-mono text-[11px] text-muted-foreground">
              {openingId === p.id ? "Starting sandbox…" : new Date(p.createdAt).toLocaleDateString()}
            </p>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
