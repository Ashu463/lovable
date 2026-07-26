import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Star } from "lucide-react";
import { PageShell } from "@/features/shell/PageShell";
import { Card } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ProjectRow {
  id: string;
  name: string | null;
  isStarred: boolean;
  isArchived: boolean;
  createdAt: string;
}

export function Projects() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter") === "starred" ? "starred" : "all";

  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ success: boolean; data: ProjectRow[] }>("/api/project")
      .then((res) => setProjects(res.data))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load projects."));
  }, []);

  const toggleStar = async (project: ProjectRow) => {
    setProjects((prev) =>
      prev?.map((p) => (p.id === project.id ? { ...p, isStarred: !p.isStarred } : p)) ?? null,
    );
    try {
      await api.patch(`/api/project/${project.id}`, { starred: !project.isStarred });
    } catch {
      // revert on failure
      setProjects((prev) =>
        prev?.map((p) => (p.id === project.id ? { ...p, isStarred: project.isStarred } : p)) ?? null,
      );
    }
  };

  const visible = (projects ?? []).filter((p) => (filter === "starred" ? p.isStarred : true));

  return (
    <PageShell
      title="Projects"
      actions={
        <div className="inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1">
          {(["all", "starred"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSearchParams(tab === "all" ? {} : { filter: tab })}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm capitalize transition-colors",
                filter === tab ? "bg-foreground text-background" : "text-muted",
              )}
            >
              {tab === "all" ? "All projects" : "Starred"}
            </button>
          ))}
        </div>
      }
    >
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!error && !projects && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!error && projects && visible.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {filter === "starred" ? "No starred projects yet." : "No projects yet — start one from the home page."}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((project) => (
          <Card key={project.id} className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-medium">{project.name ?? "Untitled project"}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Created {new Date(project.createdAt).toLocaleDateString()}
                </p>
              </div>
              <button onClick={() => toggleStar(project)} title={project.isStarred ? "Unstar" : "Star"}>
                <Star
                  className={cn(
                    "h-4 w-4 transition-colors",
                    project.isStarred ? "fill-accent text-accent" : "text-muted hover:text-foreground",
                  )}
                />
              </button>
            </div>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
