import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { gql } from "@/lib/graphql";
import { cn } from "@/lib/utils";
import { agentLabel } from "@/features/build/agentLabels";
import TODOS from "@/graphql/todos.graphql?raw";
import type { CallAgentEvent } from "../../../../../packages/agents/agent/events";

interface Todo {
  taskId: number;
  task: string;
  agent: string;
  dependency: number[];
}

type TaskStatus = "pending" | "running" | "done" | "failed";

// One drawn dependency edge, in content-space pixel coordinates. `to` is the
// dependent task, so the edge can light up when that task is the active one.
interface Edge {
  from: number;
  to: number;
  d: string;
}

// Groups todos into DAG levels from their dependency arrays alone — same
// idea as the backend's DAG.TopologicalSortParallel, just done client-side
// since todos are fetched as a flat list.
function computeLevels(todos: Todo[]): number[][] {
  const level = new Map<number, number>();
  const byId = new Map(todos.map((t) => [t.taskId, t]));

  function levelOf(id: number, seen: Set<number>): number {
    if (level.has(id)) return level.get(id)!;
    if (seen.has(id)) return 0; // guards a cycle — shouldn't happen, never trust it blindly
    seen.add(id);
    const deps = byId.get(id)?.dependency ?? [];
    const computed = deps.length === 0 ? 0 : 1 + Math.max(...deps.map((d) => levelOf(d, seen)));
    level.set(id, computed);
    return computed;
  }

  for (const t of todos) levelOf(t.taskId, new Set());
  const maxLevel = Math.max(0, ...todos.map((t) => level.get(t.taskId) ?? 0));
  const levels: number[][] = Array.from({ length: maxLevel + 1 }, () => []);
  for (const t of todos) levels[level.get(t.taskId)!]!.push(t.taskId);
  return levels;
}

// Todo.status on the backend isn't updated as the run progresses (see
// todos.graphql), so live status is derived here from the same SSE feed the
// activity log already renders — the last matching event for a taskId wins.
function taskStatus(taskId: number, feed: CallAgentEvent[]): TaskStatus {
  let status: TaskStatus = "pending";
  for (const event of feed) {
    if (event.type === "subagent_started" && event.taskId === taskId) status = "running";
    else if (event.type === "subagent_completed" && event.taskId === taskId) status = event.success ? "done" : "failed";
  }
  return status;
}

// The planned DAG for a complex run, drawn as a left-to-right graph: each
// column is a dependency level, curved edges connect a task to the tasks it
// depends on, the active task blinks, and finished ones hold their colour.
// Fetched once per run (the plan itself doesn't change mid-run) — simple-path
// runs never plan todos, so this renders nothing for them.
export function DagView({ projectId, runId, feed }: { projectId: string; runId: string; feed: CallAgentEvent[] }) {
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [edges, setEdges] = useState<Edge[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Map<number, HTMLElement>>(new Map());
  const lastProjectId = useRef<string | null>(null);

  // The plan is saved ~2min into the run (after PlanTasks), but this view
  // mounts the instant the run goes "running" — a single fetch here races the
  // save and comes back empty, leaving the graph blank for the whole run. So
  // poll until the todos land, then stop.
  useEffect(() => {
    let cancelled = false;
    // Only wipe immediately on a genuine project switch — a DAG from another
    // project must never show. A follow-up run in the SAME project keeps
    // showing the previous plan until the new one lands, rather than
    // instantly blanking for the ~2min PlanTasks takes on the new run.
    if (lastProjectId.current !== projectId) {
      setTodos(null);
      setEdges([]);
    }
    lastProjectId.current = projectId;

    const fetchTodos = () =>
      gql<{ todos: Todo[] }>(TODOS, { projectId, runId })
        .then((res) => {
          if (cancelled) return false;
          if (res.todos.length > 0) {
            setTodos(res.todos);
            return true;
          }
          return false;
        })
        .catch(() => false);

    let interval: ReturnType<typeof setInterval> | undefined;
    void fetchTodos().then((got) => {
      if (cancelled || got) return;
      interval = setInterval(() => {
        void fetchTodos().then((done) => {
          if (done && interval) clearInterval(interval);
        });
      }, 3000);
    });

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [projectId, runId]);

  // Measure node centres and build the connector paths in content-space (the
  // inner wrapper's coordinate system, so horizontal scroll doesn't shift them).
  // Re-measured on resize; status changes never move a node, so `todos` is the
  // only trigger needed.
  useLayoutEffect(() => {
    if (!todos || todos.length === 0) return;

    const measure = () => {
      const content = contentRef.current;
      if (!content) return;
      const origin = content.getBoundingClientRect();
      const next: Edge[] = [];
      for (const t of todos) {
        const childEl = nodeRefs.current.get(t.taskId);
        if (!childEl) continue;
        const child = childEl.getBoundingClientRect();
        const x2 = child.left - origin.left;
        const y2 = child.top - origin.top + child.height / 2;
        for (const dep of t.dependency) {
          const parentEl = nodeRefs.current.get(dep);
          if (!parentEl) continue;
          const parent = parentEl.getBoundingClientRect();
          const x1 = parent.right - origin.left;
          const y1 = parent.top - origin.top + parent.height / 2;
          const mx = (x1 + x2) / 2;
          next.push({ from: dep, to: t.taskId, d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}` });
        }
      }
      setEdges(next);
    };

    measure();
    const ro = new ResizeObserver(measure);
    if (contentRef.current) ro.observe(contentRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [todos]);

  if (!todos || todos.length === 0) return null;

  const levels = computeLevels(todos);
  const byId = new Map(todos.map((t) => [t.taskId, t]));

  return (
    <div className="max-h-[280px] overflow-x-auto overflow-y-auto rounded-xl border border-border bg-surface/40 px-4 py-4">
      <div ref={contentRef} className="relative flex w-max items-stretch gap-12">
        {/* Edges live behind the nodes; the node backgrounds paint over them. */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          {edges.map((edge, i) => {
            const active = taskStatus(edge.to, feed) === "running";
            return (
              <path
                key={i}
                d={edge.d}
                fill="none"
                stroke={active ? "var(--color-accent)" : "var(--color-border-hover)"}
                strokeWidth={active ? 2 : 1.5}
              />
            );
          })}
        </svg>

        {levels.map((taskIds, i) => (
          <div key={i} className="relative z-10 flex shrink-0 flex-col justify-center gap-3">
            {taskIds.map((taskId) => {
              const todo = byId.get(taskId)!;
              const status = taskStatus(taskId, feed);
              return (
                <div
                  key={taskId}
                  ref={(el) => {
                    const m = nodeRefs.current;
                    if (el) m.set(taskId, el);
                    else m.delete(taskId);
                  }}
                  title={todo.task}
                  className={cn(
                    "flex w-44 flex-col gap-0.5 rounded-lg border bg-surface px-3 py-2",
                    status === "done" && "border-ok/40",
                    status === "running" && "animate-pulse border-accent shadow-[0_0_14px_-2px_var(--color-accent)]",
                    status === "failed" && "border-danger/60",
                    status === "pending" && "border-border",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rotate-45 border",
                        status === "done" && "border-ok bg-ok",
                        status === "running" && "border-accent bg-accent",
                        status === "failed" && "border-danger bg-danger",
                        status === "pending" && "border-muted-foreground bg-transparent",
                      )}
                    />
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        status === "failed" ? "text-danger" : status === "pending" ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {agentLabel(todo.agent)}
                    </span>
                  </div>
                  <span className="truncate text-[11px] text-muted" title={todo.task}>
                    {todo.task}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
