import { useEffect, useState } from "react";
import { SearchIcon } from "lucide-react";
import { PageShell } from "@/features/shell/PageShell";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { gql, GqlError } from "@/lib/graphql";
import PROJECTS from "@/graphql/projectsSummary.graphql?raw";

interface ProjectRow {
  id: string;
  name: string | null;
  createdAt: string;
}

export function Search() {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    gql<{ projects: ProjectRow[] }>(PROJECTS)
      .then((res) => setProjects(res.projects))
      .catch((err) => setError(err instanceof GqlError ? err.message : "Failed to load projects."));
  }, []);

  const results = (projects ?? []).filter((p) =>
    (p.name ?? "Untitled project").toLowerCase().includes(query.toLowerCase()),
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

      <div className="space-y-2">
        {results.map((p) => (
          <Card key={p.id} className="flex items-center justify-between px-4 py-3">
            <p className="font-medium">{p.name ?? "Untitled project"}</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {new Date(p.createdAt).toLocaleDateString()}
            </p>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
