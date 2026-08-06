import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Star } from "lucide-react";
import { PageShell } from "@/features/shell/PageShell";
import { gql, GqlError } from "@/lib/graphql";
import { cn } from "@/lib/utils";
import PROJECTS from "@/graphql/projects.graphql?raw";
import SET_STARRED from "@/graphql/setStarred.graphql?raw";
import PROJECT_SESSION from "@/graphql/projectSession.graphql?raw";

interface ProjectRow {
  id: string;
  name: string | null;
  isStarred: boolean;
  isArchived: boolean;
  createdAt: string;
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
    gql<{ projects: ProjectRow[] }>(PROJECTS)
      .then((res) => setProjects(res.projects))
      .catch((err) => setError(err instanceof GqlError ? err.message : "Failed to load projects."));
  }, []);

  const toggleStar = async (project: ProjectRow) => {
    setProjects((prev) =>
      prev?.map((p) => (p.id === project.id ? { ...p, isStarred: !p.isStarred } : p)) ?? null,
    );
    try {
      await gql(SET_STARRED, { id: project.id, starred: !project.isStarred });
    } catch {
      // revert on failure
      setProjects((prev) =>
        prev?.map((p) => (p.id === project.id ? { ...p, isStarred: project.isStarred } : p)) ?? null,
      );
    }
  };

  const openProject = async (project: ProjectRow) => {
    setOpenError(null);
    setOpeningId(project.id);
    try {
      // Boots the project's sandbox back up (restoring files from R2 if it died)
      // and refreshes its preview URL before we land on the workspace, which is
      // keyed by runId rather than projectId.
      const res = await gql<{ projectSession: { latestRunId: string | null } }>(
        PROJECT_SESSION,
        { id: project.id },
      );
      if (!res.projectSession.latestRunId) {
        setOpenError("This project doesn't have a build yet.");
        return;
      }
      navigate(`/w/${res.projectSession.latestRunId}`);
    } catch (err) {
      setOpenError(err instanceof GqlError ? err.message : "Couldn't open this project.");
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
