// test.ts
// Run with: npx tsx test.ts   (or npx ts-node test.ts)
import type { Todo } from "../../baml_client"
import { DAG } from "./dag" // adjust path to wherever your DAG class lives

function makeTodo(id: number, dependency: number[]): Todo {
  return { id, task: `task-${id}`, agent: "test-agent", status: "pending", dependency }
}

function assertEqual(actual: number[], expected: number[], label: string) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`${pass ? "PASS" : "FAIL"} - ${label}`)
  console.log(`  expected: ${JSON.stringify(expected)}`)
  console.log(`  actual:   ${JSON.stringify(actual)}`)
  console.log("")
}

// Test 1: your example
{
  const todos = [
    makeTodo(1, []),
    makeTodo(2, [1]),
    makeTodo(3, [1]),
    makeTodo(4, [1, 2]),
    makeTodo(5, [1, 2]),
    makeTodo(6, [1, 3]),
  ]
  const dag = new DAG(todos)
  assertEqual(dag.TopologicalSort(), [1, 2, 3, 4, 5, 6], "example from conversation")
}

// Test 2: no dependencies
{
  const todos = [makeTodo(1, []), makeTodo(2, []), makeTodo(3, [])]
  const dag = new DAG(todos)
  assertEqual(dag.TopologicalSort(), [1, 2, 3], "no dependencies")
}

// Test 3: linear chain
{
  const todos = [makeTodo(1, []), makeTodo(2, [1]), makeTodo(3, [2]), makeTodo(4, [3])]
  const dag = new DAG(todos)
  assertEqual(dag.TopologicalSort(), [1, 2, 3, 4], "linear chain")
}

// Test 4: single task
{
  const todos = [makeTodo(1, [])]
  const dag = new DAG(todos)
  assertEqual(dag.TopologicalSort(), [1], "single task")
}

// Test 5: cycle should throw
{
  const todos = [makeTodo(1, [2]), makeTodo(2, [1])]
  const dag = new DAG(todos)
  try {
    dag.TopologicalSort()
    console.log("FAIL - cycle detection (expected throw, got none)\n")
  } catch (err) {
    console.log(`PASS - cycle detection (threw: "${(err as Error).message}")\n`)
  }
}

// Test 6: missing dependency id
{
  const todos = [makeTodo(1, [999]), makeTodo(2, [1])]
  const dag = new DAG(todos)
  assertEqual(dag.TopologicalSort(), [1, 2], "missing dependency id treated as satisfied")
}

console.log("Done.")