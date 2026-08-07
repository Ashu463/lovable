import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { TemplateGrid } from "@/features/templates/TemplateGrid";
import { useAuth } from "@/lib/auth";
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

function MyProjects() {
  const { session } = useAuth();
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { openProject, openingId, openError } = useOpenProject();

  useEffect(() => {
    if (!session) return;
    gql<{ projects: ProjectRow[] }>(PROJECTS)
      .then((res) => setProjects(res.projects.slice(0, 6)))
      .catch((err) => setError(err instanceof GqlError ? err.message : "Failed to load projects."));
  }, [session]);

  if (!session) {
    return <p className="text-sm text-muted-foreground">Sign in to see your projects here.</p>;
  }
  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!projects) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (projects.length === 0) {
    return <p className="text-sm text-muted-foreground">No projects yet — start one above.</p>;
  }

  return (
    <>
      {openError && <p className="mb-4 text-sm text-red-400">{openError}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <Card
            key={p.id}
            role="button"
            tabIndex={0}
            aria-busy={openingId === p.id}
            onClick={() => void openProject(p)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                void openProject(p);
              }
            }}
            className={cn(
              "cursor-pointer p-5 text-left transition-colors hover:bg-surface-hover",
              openingId === p.id && "pointer-events-none opacity-60",
            )}
          >
            <h3 className="line-clamp-2 font-medium">{p.title}</h3>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              {openingId === p.id
                ? "Starting sandbox…"
                : new Date(p.createdAt).toLocaleDateString()}
            </p>
          </Card>
        ))}
      </div>
    </>
  );
}

export function HomeProjectsTabs() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <h2 className="mb-6 font-display text-xl font-semibold tracking-tight">Your projects</h2>
      <Tabs defaultValue="projects">
        <div className="mb-6 flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="projects">My projects</TabsTrigger>
            <TabsTrigger value="templates">Lovable templates</TabsTrigger>
          </TabsList>
          <Link to="/projects" className="font-mono text-xs text-muted transition-colors hover:text-foreground">
            View all →
          </Link>
        </div>

        <TabsContent value="projects">
          <MyProjects />
        </TabsContent>
        <TabsContent value="templates">
          <TemplateGrid />
        </TabsContent>
      </Tabs>
    </section>
  );
}
