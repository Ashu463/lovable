import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { TemplateGrid } from "@/features/templates/TemplateGrid";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";

interface ProjectRow {
  id: string;
  name: string | null;
  createdAt: string;
}

function MyProjects() {
  const { session } = useAuth();
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    api
      .get<{ success: boolean; data: ProjectRow[] }>("/api/project")
      .then((res) => setProjects(res.data.slice(0, 6)))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load projects."));
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => (
        <Card key={p.id} className="p-5">
          <h3 className="font-medium">{p.name ?? "Untitled project"}</h3>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {new Date(p.createdAt).toLocaleDateString()}
          </p>
        </Card>
      ))}
    </div>
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
