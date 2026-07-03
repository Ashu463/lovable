import type { Todo } from "../../baml_client";

export class DAG{

    constructor(
        public todos: Todo[]
    ){}

    answer: Array<number> = []
    visited: Array<number> = []
    todosGraph: Array<Array<number>> = []

    dfs(task: number): void{
        this.visited[task] = 1;
        const neighbours = this.todosGraph[task] ?? []
        for(const neighbour of neighbours){
            if(!this.visited[neighbour]){
                this.dfs(neighbour)
            }
        }
        this.answer.push(task);
        
    }
    // I'm heavily assuming that ids of task will be from 1 to n.
    async TopologicalSort(): Promise<number[]>{
        this.answer = [] 
        this.todosGraph = this.makeGraph(this.todos);

        let n: number = this.todosGraph.length
        this.visited = Array(n).fill(0)

        for(var i = 0 ; i < n; i++){
            if(this.visited[i] === 0){
                this.dfs(i)
            }
        }
        return this.answer.reverse()
    }

    makeGraph(todos: Todo[]){
        let n = todos.length
        const todosGraph: Array<Array<number>> = []

        for(const todo of todos){
            todosGraph[todo.id] = todo.dependency
        }
        return todosGraph
    }
}