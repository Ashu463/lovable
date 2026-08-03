import { test, expect } from "bun:test";
import { DAG } from "./dag";
import type { PlannerTodo } from "../../baml_client";

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

// test("no dependencies: everything lands in a single wave", () => {
//     const dag = new DAG([todo(1), todo(2), todo(3)]);
//     const levels = dag.TopologicalSortParallel();

//     expect(levels.length).toBe(1);
//     expect(levels[0].sort()).toEqual([1, 2, 3]);
// });

// test("linear chain: one task per wave, in dependency order", () => {
//     const dag = new DAG([todo(1), todo(2, [1]), todo(3, [2])]);
//     const levels = dag.TopologicalSortParallel();

//     expect(levels).toEqual([[1], [2], [3]]);
// });

// test("diamond: fan-out then fan-in waits for both branches", () => {
//     // 1 -> 2 -> 4
//     // 1 -> 3 -> 4
//     const dag = new DAG([todo(1), todo(2, [1]), todo(3, [1]), todo(4, [2, 3])]);
//     const levels = dag.TopologicalSortParallel();

//     expect(levels.length).toBe(3);
//     expect(levels[0]).toEqual([1]);
//     expect(levels[1].sort()).toEqual([2, 3]);
//     expect(levels[2]).toEqual([4]);
// });

// test("disjoint components are scheduled independently, same wave", () => {
//     // 1 -> 2   and   3 -> 4, unrelated to each other
//     const dag = new DAG([todo(1), todo(2, [1]), todo(3), todo(4, [3])]);
//     const levels = dag.TopologicalSortParallel();

//     expect(levels.length).toBe(2);
//     expect(levels[0].sort()).toEqual([1, 3]);
//     expect(levels[1].sort()).toEqual([2, 4]);
// });

// test("empty todo list produces no waves", () => {
//     const dag = new DAG([]);
//     expect(dag.TopologicalSortParallel()).toEqual([]);
// });

// test("direct cycle throws instead of silently dropping tasks", () => {
//     const dag = new DAG([todo(1, [2]), todo(2, [1])]);
//     expect(() => dag.TopologicalSortParallel()).toThrow("Cycle detected");
// });

// test("self-dependency throws", () => {
//     const dag = new DAG([todo(1, [1])]);
//     expect(() => dag.TopologicalSortParallel()).toThrow("Cycle detected");
// });

// test("dependency on a nonexistent task id throws immediately", () => {
//     const dag = new DAG([todo(1, [99])]);
//     expect(() => dag.TopologicalSortParallel()).toThrow("unknown task 99");
// });

// test("every task appears in exactly one wave", () => {
//     const dag = new DAG([
//         todo(1), todo(2, [1]), todo(3, [1]), todo(4, [2]), todo(5, [3, 4]),
//     ]);
//     const levels = dag.TopologicalSortParallel();
//     const flat = levels.flat();

//     expect(flat.length).toBe(5);
//     expect(new Set(flat).size).toBe(5);
// });

const todos: PlannerTodo[] = [
    {
      id: 1,
      task: "Initialize the project structure with routing, state management, linting, and testing setup.",
      agent: "coder",
      status: "pending",
      dependency: [],
      designNeeded: false,
    },
    {
      id: 2,
      task: "Implement the database schema and backend APIs for users, todo lists, tasks, subtasks, labels, priorities, due dates, and recurring tasks.",
      agent: "coder",
      status: "pending",
      dependency: [1],
      designNeeded: false,
    },
    {
      id: 3,
      task: "Implement authentication and authorization, including login, registration, protected routes, and session management.",
      agent: "coder",
      status: "pending",
      dependency: [2],
      designNeeded: false,
    },
    {
      id: 4,
      task: "Build the dashboard layout, navigation, and responsive application shell.",
      agent: "coder",
      status: "pending",
      dependency: [1],
      designNeeded: true,
    },
    {
      id: 5,
      task: "Implement CRUD functionality for todo lists and tasks integrated with the backend APIs.",
      agent: "coder",
      status: "pending",
      dependency: [2, 4],
      designNeeded: false,
    },
    {
      id: 6,
      task: "Implement advanced task management including subtasks, priorities, labels, due dates, recurring tasks, and task completion workflows.",
      agent: "coder",
      status: "pending",
      dependency: [5],
      designNeeded: false,
    },
    {
      id: 7,
      task: "Implement search, filtering, sorting, and pagination across tasks.",
      agent: "coder",
      status: "pending",
      dependency: [5],
      designNeeded: false,
    },
    {
      id: 8,
      task: "Implement drag-and-drop task organization between lists and reorder functionality.",
      agent: "coder",
      status: "pending",
      dependency: [5],
      designNeeded: false,
    },
    {
      id: 9,
      task: "Implement notifications, reminders, and background scheduling for due and recurring tasks.",
      agent: "coder",
      status: "pending",
      dependency: [6],
      designNeeded: false,
    },
    {
      id: 10,
      task: "Implement comprehensive automated tests, verify application functionality, and ensure the project passes build, lint, and test commands.",
      agent: "coder",
      status: "pending",
      dependency: [3, 6, 7, 8, 9],
      designNeeded: false,
    },
  ];

const dag = new DAG(todos)

console.log(dag.TopologicalSortParallel())