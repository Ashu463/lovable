import type { Todo } from "../../baml_client";

export class DAG{

    constructor(
        public todos: Todo[]
    ){}

    // answer: Array<number> = []
    answer: number[] = []
    visited: Map<number, 0 | 1 | 2> = new Map()
    todosGraph: Map<number, number[]> = new Map()
    levels: Map<number, number> = new Map()

    dfs(taskId: number): void{
        this.visited.set(taskId, 1) // in-progress

        const neighbours = this.todosGraph.get(taskId) ?? []
        for (const neighbour of neighbours) {
            const state = this.visited.get(neighbour) ?? 0
            if (state === 1) {
                throw new Error(`Cycle detected: task ${taskId} -> ${neighbour}`)
            }
            if (state === 0) {
                this.dfs(neighbour)
            }
        }

        this.visited.set(taskId, 2) // done
        this.answer.push(taskId)
            
    }
    // I'm heavily assuming that ids of task will be from 1 to n.
    TopologicalSort(): number[]{
        this.answer = []
        this.todosGraph = this.makeGraph(this.todos)
        this.visited = new Map()

        for (const todo of this.todos) {
            if ((this.visited.get(todo.id) ?? 0) === 0) {
                this.dfs(todo.id)
            }
        }

        return this.answer
    }

    makeGraph(todos: Todo[]): Map<number, number[]> {
        const graph = new Map<number, number[]>()
        for (const todo of todos) {
            graph.set(todo.id, todo.dependency)
        }
        return graph
    }
    topoSortParallel(): number[][] { // written by claude not me.
        // Build a lookup: taskId -> its dependency list
        const dependsOn = new Map<number, number[]>()
        for (const todo of this.todos) {
        dependsOn.set(todo.id, todo.dependency)
        }

        const done = new Set<number>()
        const result: number[][] = []

        // Keep peeling off "ready" batches until every task is done
        while (done.size < this.todos.length) {
        const readyBatch: number[] = []

        for (const todo of this.todos) {
            if (done.has(todo.id)) continue

            const deps = dependsOn.get(todo.id) ?? []
            const allDepsDone = deps.every(depId => done.has(depId))

            if (allDepsDone) {
            readyBatch.push(todo.id)
            }
        }

        if (readyBatch.length === 0) {
            // Nothing became ready this round, but tasks remain -> cycle
            throw new Error("Cycle detected — remaining tasks can never become ready")
        }

        readyBatch.forEach(id => done.add(id))
        result.push(readyBatch)
        }

        return result
    }

}
