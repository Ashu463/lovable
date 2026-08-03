import type { PlannerTodo } from "../../baml_client";

export class DAG{

    constructor(
        public todos: PlannerTodo[]
    ){
        this.todosGraph = this.makeGraph(todos)
    }

    // answer: Array<number> = []
    answer: number[] = []
    visited: Map<number, 0 | 1 | 2> = new Map()
    todosGraph: Map<number, number[]> = new Map()
    levels: Map<number, number> = new Map()

    makeGraph(todos: PlannerTodo[]): Map<number, number[]> {
        const graph = new Map<number, number[]>()
        for (const todo of todos) {
            graph.set(todo.id, todo.dependency)
        }
        return graph
    }

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
    TopologicalSort(): PlannerTodo[]{
        this.answer = []
        // this.todosGraph = this.makeGraph(this.todos)
        this.visited = new Map()

        for (const todo of this.todos) {
            if ((this.visited.get(todo.id) ?? 0) === 0) {
                this.dfs(todo.id)
            }
        }
        const sequenctialTodos: PlannerTodo[] = this.answer.map(taskId => this.todos.find(todo => todo.id === taskId))
            .filter((todo): todo is PlannerTodo => todo !== undefined)
        
        return sequenctialTodos
    }
    TopologicalSortParallel(): number[][]{
        //  frame graph
        //  frame indegree from the graph
        //  then kahn's algo
        // let n = this.todos.length
        // var indegree: number[] = new Array<number>(n).fill(0)
        // for(let i = 0; i < this.todos.length; i++){
        //     for(let j = 0; j < this.todosGraph.get(i)!.length; j++){
        //         indegree[j] = indegree[j] + 1;
        //     }
        // }
        /*
        queue<pair<int, int>> q; // number, cnt
        q.push({0th of indegree, 1})
        vector<vector<int>> ans;
        ans[step cnt].push_back(that task number)
        while(!q.empty()){
            int task = q.first
            int step = q.second;
            for(auto it: this.todosGraph.get(task)){
                q.push({it, step++})
            }
            ans[task].push_back(step)
            q.pop();

        */
        // }

        const dependents = new Map<number, number[]>()
        const indegree = new Map<number, number>()

        for (const todo of this.todos) {
            indegree.set(todo.id, todo.dependency.length)
        }
        for (const todo of this.todos) {
            for (const dep of todo.dependency) {
                if (!indegree.has(dep)) {
                    throw new Error(`Task ${todo.id} depends on unknown task ${dep}`)
                }
                const list = dependents.get(dep)
                if (list) list.push(todo.id)
                else dependents.set(dep, [todo.id])
            }
        }

        const levels: number[][] = []
        let frontier = this.todos.filter(t => indegree.get(t.id) === 0).map(t => t.id)
        let scheduled = 0

        while (frontier.length > 0) {
            levels.push(frontier)
            scheduled += frontier.length

            const next: number[] = []
            for (const taskId of frontier) {
                for (const dependent of dependents.get(taskId) ?? []) {
                    const remaining = indegree.get(dependent)! - 1
                    indegree.set(dependent, remaining)
                    if (remaining === 0) next.push(dependent)
                }
            }
            frontier = next
        }

        if (scheduled !== this.todos.length) {
            throw new Error("Cycle detected: not all todos are reachable")
        }

        return levels

    }
    

}
