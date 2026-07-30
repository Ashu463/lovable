import { describe, expect, test } from "bun:test";
import type { PlannerTodo } from "../../baml_client";
import { DAG } from "./dag";

function todo(id: number, dependency: number[] = []): PlannerTodo {
    return {
        id,
        task: `task ${id}`,
        agent: "coder",
        status: "pending",
        dependency,
        designNeeded: false,
    };
}

function isBefore(ids: number[], a: number, b: number): boolean {
    return ids.indexOf(a) < ids.indexOf(b);
}

describe("DAG.makeGraph", () => {
    test("maps every task id to its dependency list", () => {
        const dag = new DAG([todo(1), todo(2, [1]), todo(3, [1, 2])]);
        const graph = dag.makeGraph(dag.todos);

        expect([...graph.entries()]).toEqual([
            [1, []],
            [2, [1]],
            [3, [1, 2]],
        ]);
    });
});

describe("DAG.TopologicalSort", () => {
    test("returns an empty list for no todos", () => {
        expect(new DAG([]).TopologicalSort()).toEqual([]);
    });

    test("emits dependencies before the tasks that need them", () => {
        const todos = [todo(1, [2]), todo(2, [3]), todo(3)];
        const ids = new DAG(todos).TopologicalSort().map((t) => t.id);

        expect(ids).toEqual([3, 2, 1]);
    });

    test("keeps a diamond dependency in a valid order", () => {
        // 1 <- 2, 1 <- 3, {2,3} <- 4
        const todos = [todo(1), todo(2, [1]), todo(3, [1]), todo(4, [2, 3])];
        const ids = new DAG(todos).TopologicalSort().map((t) => t.id);

        expect(ids).toHaveLength(4);
        expect(isBefore(ids, 1, 2)).toBe(true);
        expect(isBefore(ids, 1, 3)).toBe(true);
        expect(isBefore(ids, 2, 4)).toBe(true);
        expect(isBefore(ids, 3, 4)).toBe(true);
    });

    test("includes tasks from disconnected components", () => {
        const todos = [todo(1), todo(2, [1]), todo(3), todo(4, [3])];
        const ids = new DAG(todos).TopologicalSort().map((t) => t.id);

        expect(ids.sort()).toEqual([1, 2, 3, 4]);
    });

    test("returns the original todo objects, not copies", () => {
        const todos = [todo(1), todo(2, [1])];
        const sorted = new DAG(todos).TopologicalSort();

        expect(sorted[0]).toBe(todos[0]);
        expect(sorted[1]).toBe(todos[1]);
    });

    test("drops dependencies pointing at unknown task ids", () => {
        const todos = [todo(1, [99]), todo(2, [1])];
        const ids = new DAG(todos).TopologicalSort().map((t) => t.id);

        expect(ids).toEqual([1, 2]);
    });

    test("throws on a cycle", () => {
        const todos = [todo(1, [2]), todo(2, [1])];

        expect(() => new DAG(todos).TopologicalSort()).toThrow(/Cycle detected/);
    });

    test("throws on a task depending on itself", () => {
        expect(() => new DAG([todo(1, [1])]).TopologicalSort()).toThrow(/Cycle detected/);
    });

    test("is idempotent across repeated calls", () => {
        const dag = new DAG([todo(1), todo(2, [1]), todo(3, [2])]);

        expect(dag.TopologicalSort().map((t) => t.id)).toEqual([1, 2, 3]);
        expect(dag.TopologicalSort().map((t) => t.id)).toEqual([1, 2, 3]);
    });
});

describe("DAG.topoSortParallel", () => {
    test("returns no batches for no todos", () => {
        expect(new DAG([]).topoSortParallel()).toEqual([]);
    });

    test("puts independent tasks in the same batch", () => {
        const todos = [todo(1), todo(2), todo(3, [1, 2])];

        expect(new DAG(todos).topoSortParallel()).toEqual([[1, 2], [3]]);
    });

    test("serializes a dependency chain into one batch per task", () => {
        const todos = [todo(1), todo(2, [1]), todo(3, [2])];

        expect(new DAG(todos).topoSortParallel()).toEqual([[1], [2], [3]]);
    });

    test("waits for every dependency of a task before scheduling it", () => {
        // 3 depends on 2, which depends on 1; 4 only depends on 1
        const todos = [todo(1), todo(2, [1]), todo(3, [2]), todo(4, [1])];

        expect(new DAG(todos).topoSortParallel()).toEqual([[1], [2, 4], [3]]);
    });

    test("throws on a cycle instead of looping forever", () => {
        const todos = [todo(1, [2]), todo(2, [1])];

        expect(() => new DAG(todos).topoSortParallel()).toThrow(/Cycle detected/);
    });

    test("throws when a dependency id does not exist", () => {
        expect(() => new DAG([todo(1, [99])]).topoSortParallel()).toThrow(/Cycle detected/);
    });
});
