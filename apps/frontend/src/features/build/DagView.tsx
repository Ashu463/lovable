import { useEffect, useState } from "react";
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

// The planned DAG for a complex run. Fetched once per run (the plan itself
// doesn't change mid-run) — simple-path runs never plan todos, so this
// renders nothing for them.
export function DagView({ projectId, runId, feed }: { projectId: string; runId: string; feed: CallAgentEvent[] }) {
  const [todos, setTodos] = useState<Todo[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTodos(null);
    gql<{ todos: Todo[] }>(TODOS, { projectId, runId })
      .then((res) => {
        if (!cancelled) setTodos(res.todos);
      })
      .catch(() => {
        if (!cancelled) setTodos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, runId]);

  if (!todos || todos.length === 0) return null;

  const levels = computeLevels(todos);
  const byId = new Map(todos.map((t) => [t.taskId, t]));

  return (
    <div className="flex gap-4 overflow-x-auto rounded-xl border border-border bg-surface/40 px-4 py-3">
      {levels.map((taskIds, i) => (
        <div key={i} className="flex shrink-0 flex-col gap-2">
          {taskIds.map((taskId) => {
            const todo = byId.get(taskId)!;
            const status = taskStatus(taskId, feed);
            return (
              <div
                key={taskId}
                title={todo.task}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] whitespace-nowrap",
                  status === "done" && "border-ok/40 text-muted",
                  status === "running" && "border-accent text-foreground",
                  status === "failed" && "border-danger/60 text-danger",
                  status === "pending" && "border-border text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rotate-45 border",
                    status === "done" && "border-ok bg-ok",
                    status === "running" && "border-accent bg-accent shadow-[0_0_10px_var(--color-accent)]",
                    status === "failed" && "border-danger bg-danger",
                    status === "pending" && "border-muted-foreground bg-transparent",
                  )}
                />
                <span className="font-medium">{agentLabel(todo.agent)}</span>
                <span className="max-w-[160px] truncate text-muted-foreground">{todo.task}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
