import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Star } from "lucide-react";
import { PageShell } from "@/features/shell/PageShell";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ProjectRow {
  id: string;
  name: string | null;
  isStarred: boolean;
  isArchived: boolean;
  createdAt: string;
}

interface RunRow {
  id: string;
}

export function Projects() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter") === "starred" ? "starred" : "all";

  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

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
    } catch (err) {
      // revert on failure, and say so — the star silently snapping back looked
      // like a UI bug
      setProjects((prev) =>
        prev?.map((p) => (p.id === project.id ? { ...p, isStarred: project.isStarred } : p)) ?? null,
      );
      setOpenError(err instanceof ApiError ? err.message : "Couldn't update this project.");
    }
  };

  const openProject = async (project: ProjectRow) => {
    setOpenError(null);
    setOpeningId(project.id);
    try {
      // The history endpoint returns runs newest-first — the latest run's id
      // is what /w/:runId needs, since the workspace is keyed by run, not project.
      const res = await api.get<{ success: boolean; data: RunRow[] }>(`/api/chat/${project.id}/history`);
      const latest = res.data[0];
      if (!latest) {
        setOpenError("This project doesn't have a build yet.");
        return;
      }
      navigate(`/w/${latest.id}`);
    } catch (err) {
      setOpenError(err instanceof ApiError ? err.message : "Couldn't open this project.");
    } finally {
      setOpeningId(null);
    }
  };

  const visible = (projects ?? []).filter((p) => (filter === "starred" ? p.isStarred : true));

  return (
    <PageShell
      title="Projects"
      subtitle="Every build you've started — click a row to reopen it."
      actions={
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface p-1 font-mono text-xs">
          {(["all", "starred"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSearchParams(tab === "all" ? {} : { filter: tab })}
              className={cn(
                "rounded-md px-3.5 py-1.5 capitalize transition-colors",
                filter === tab ? "bg-surface-hover text-foreground" : "text-muted",
              )}
            >
              {tab === "all" ? "All projects" : "Starred"}
            </button>
          ))}
        </div>
      }
    >
      {error && <p className="text-sm text-red-400">{error}</p>}
      {openError && <p className="mb-4 text-sm text-red-400">{openError}</p>}
      {!error && !projects && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!error && projects && visible.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {filter === "starred" ? "No starred projects yet." : "No projects yet — start one from the home page."}
        </p>
      )}

      {visible.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-border bg-surface px-5 py-2.5 font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
            <span>project</span>
            <span>created</span>
            <span />
          </div>
          {visible.map((project) => (
            <button
              key={project.id}
              onClick={() => openProject(project)}
              disabled={openingId === project.id}
              className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-border px-5 py-3.5 text-left text-sm transition-colors last:border-b-0 hover:bg-surface disabled:opacity-60"
            >
              <span className="truncate font-medium">
                {openingId === project.id ? "Opening…" : (project.name ?? "Untitled project")}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {new Date(project.createdAt).toLocaleDateString()}
              </span>
              <span
                role="button"
                title={project.isStarred ? "Unstar" : "Star"}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleStar(project);
                }}
              >
                <Star
                  className={cn(
                    "h-4 w-4 transition-colors",
                    project.isStarred ? "fill-accent text-accent" : "text-muted hover:text-foreground",
                  )}
                />
              </span>
            </button>
          ))}
        </div>
      )}
    </PageShell>
  );
}
