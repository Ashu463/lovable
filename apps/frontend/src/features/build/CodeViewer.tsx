import { useEffect, useState } from "react";
import { FileCode } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ProjectFile {
  path: string;
  content: string;
}

export function CodeViewer({ projectId }: { projectId: string }) {
  const [files, setFiles] = useState<ProjectFile[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFiles(null);
    setError(null);

    api
      .get<{ success: boolean; data: ProjectFile[] }>(`/api/project/${projectId}/files`)
      .then((res) => {
        if (cancelled) return;
        setFiles(res.data);
        setSelected(res.data[0]?.path ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Failed to load files.");
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (error) {
    return <div className="p-6 text-sm text-muted">Couldn&rsquo;t load files: {error}</div>;
  }

  if (!files) {
    return <div className="p-6 text-sm text-muted-foreground">Loading files…</div>;
  }

  if (files.length === 0) {
    return <div className="p-6 text-sm text-muted-foreground">No files synced for this project yet.</div>;
  }

  const active = files.find((f) => f.path === selected);

  return (
    <div className="flex h-full">
      <div className="w-56 shrink-0 overflow-y-auto border-r border-border py-2">
        {files.map((f) => (
          <button
            key={f.path}
            onClick={() => setSelected(f.path)}
            className={cn(
              "flex w-full items-center gap-2 truncate px-3 py-1.5 text-left text-xs text-muted transition-colors hover:text-foreground",
              selected === f.path && "bg-surface-hover text-foreground",
            )}
            title={f.path}
          >
            <FileCode className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{f.path}</span>
          </button>
        ))}
      </div>
      <pre className="flex-1 overflow-auto p-4 text-xs leading-relaxed text-foreground/90">
        <code>{active?.content ?? "Select a file"}</code>
      </pre>
    </div>
  );
}
