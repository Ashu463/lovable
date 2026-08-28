import { useEffect, useMemo, useState } from "react";
import CodeMirror, { EditorView, type Extension } from "@uiw/react-codemirror";
import { dracula } from "@uiw/codemirror-theme-dracula";
import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import { gql, GqlError } from "@/lib/graphql";
import { cn } from "@/lib/utils";
import PROJECT_FILES from "@/graphql/projectFiles.graphql?raw";

interface ProjectFile {
  path: string;
  content: string;
}

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: TreeNode[];
}

// Turns the flat {path, content}[] the backend returns into a nested tree by
// splitting each path on "/" and reusing folder nodes across files that
// share a prefix. Folders sort before files, alphabetically within each.
//
// File leaves always carry the file's own original `path` string, never a
// path rebuilt from split() segments — projectFiles' paths can have a
// leading slash (a pre-existing quirk in how SyncR2 strips SANDBOX_HOME,
// see packages/agents/agent/utils/sandbox.ts), and split("/").filter(Boolean)
// silently drops that empty leading segment, so a rebuilt string stops
// matching the source data it's supposed to look up. Folder paths don't
// have this problem — they're only ever used as internal tree/React keys,
// never looked up against `files`.
function buildTree(files: ProjectFile[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let level = root;
    let folderPath = "";
    parts.forEach((part, i) => {
      const isLast = i === parts.length - 1;
      if (isLast) {
        if (!level.some((n) => n.type === "file" && n.path === file.path)) {
          level.push({ name: part, path: file.path, type: "file" });
        }
        return;
      }
      folderPath = folderPath ? `${folderPath}/${part}` : part;
      let node = level.find((n) => n.type === "folder" && n.name === part);
      if (!node) {
        node = { name: part, path: folderPath, type: "folder", children: [] };
        level.push(node);
      }
      level = node.children!;
    });
  }

  function sortTree(nodes: TreeNode[]) {
    nodes.sort((a, b) => (a.type !== b.type ? (a.type === "folder" ? -1 : 1) : a.name.localeCompare(b.name)));
    for (const n of nodes) if (n.children) sortTree(n.children);
  }
  sortTree(root);
  return root;
}

function allFolderPaths(nodes: TreeNode[]): string[] {
  return nodes.flatMap((n) => (n.type === "folder" ? [n.path, ...allFolderPaths(n.children ?? [])] : []));
}

const INDENT_PX = 14;

function TreeRow({
  node,
  depth,
  selected,
  onSelectFile,
  expanded,
  onToggleFolder,
}: {
  node: TreeNode;
  depth: number;
  selected: string | null;
  onSelectFile: (path: string) => void;
  expanded: Set<string>;
  onToggleFolder: (path: string) => void;
}) {
  if (node.type === "file") {
    return (
      <button
        onClick={() => onSelectFile(node.path)}
        style={{ paddingLeft: `${depth * INDENT_PX + 26}px` }}
        className={cn(
          "flex w-full items-center gap-1.5 truncate py-1 pr-2 text-left font-mono text-xs text-muted transition-colors hover:text-foreground",
          selected === node.path && "bg-surface-hover text-foreground",
        )}
        title={node.path}
      >
        <File className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{node.name}</span>
      </button>
    );
  }

  const isOpen = expanded.has(node.path);
  return (
    <div>
      <button
        onClick={() => onToggleFolder(node.path)}
        style={{ paddingLeft: `${depth * INDENT_PX + 8}px` }}
        className="flex w-full items-center gap-1 truncate py-1 pr-2 text-left font-mono text-xs text-muted transition-colors hover:text-foreground"
        title={node.path}
      >
        {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        {isOpen ? <FolderOpen className="h-3.5 w-3.5 shrink-0" /> : <Folder className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{node.name}</span>
      </button>
      {isOpen &&
        node.children?.map((child) => (
          <TreeRow
            key={child.path}
            node={child}
            depth={depth + 1}
            selected={selected}
            onSelectFile={onSelectFile}
            expanded={expanded}
            onToggleFolder={onToggleFolder}
          />
        ))}
    </div>
  );
}

const editorTheme = dracula;

// Read-only for now — writing edits back to the sandbox is a separate,
// bigger decision (the agent can be writing the same files mid-run; that's
// the same class of conflict the merge resolver handles for parallel tasks,
// not something to bolt on silently here).
function languageFor(path: string): Extension {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return javascript({ jsx: true });
    case "css":
      return css();
    case "html":
      return html();
    case "json":
      return json();
    case "md":
      return markdown();
    default:
      return [];
  }
}

export function CodeViewer({ projectId }: { projectId: string }) {
  const [files, setFiles] = useState<ProjectFile[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFiles(null);
    setError(null);

    gql<{ projectFiles: ProjectFile[] }>(PROJECT_FILES, { id: projectId })
      .then((res) => {
        if (cancelled) return;
        setFiles(res.projectFiles);
        setSelected(res.projectFiles[0]?.path ?? null);
        // Everything expanded by default — a freshly generated project is
        // small enough that a fully-collapsed tree is just extra clicking.
        setExpanded(new Set(allFolderPaths(buildTree(res.projectFiles))));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof GqlError ? err.message : "Failed to load files.");
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const tree = useMemo(() => (files ? buildTree(files) : []), [files]);
  const active = files?.find((f) => f.path === selected);
  const extensions = useMemo(
    () => (active ? [languageFor(active.path), EditorView.lineWrapping] : []),
    [active],
  );

  const toggleFolder = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  if (error) {
    return <div className="p-6 text-sm text-muted">Couldn&rsquo;t load files: {error}</div>;
  }

  if (!files) {
    return <div className="p-6 text-sm text-muted-foreground">Loading files…</div>;
  }

  if (files.length === 0) {
    return <div className="p-6 text-sm text-muted-foreground">No files synced for this project yet.</div>;
  }

  return (
    <div className="flex h-full">
      <div className="w-56 shrink-0 overflow-y-auto border-r border-border py-2">
        {tree.map((node) => (
          <TreeRow
            key={node.path}
            node={node}
            depth={0}
            selected={selected}
            onSelectFile={setSelected}
            expanded={expanded}
            onToggleFolder={toggleFolder}
          />
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {active ? (
          <CodeMirror
            key={active.path}
            value={active.content}
            editable={false}
            theme={editorTheme}
            extensions={extensions}
            height="100%"
            basicSetup={{ foldGutter: true, highlightActiveLine: true, highlightActiveLineGutter: true }}
            className="h-full font-mono text-xs"
          />
        ) : (
          <div className="p-4 text-sm text-muted-foreground">Select a file</div>
        )}
      </div>
    </div>
  );
}
