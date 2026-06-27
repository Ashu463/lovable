import { AgentStatus, type AgentRole, type Task, type Tool } from "../types"

interface Message {
    observations: string[]
    notes: string[]
    completedTasks: string[]
}
class Agent{
    constructor(
        public name: string,
        public description: string
    ){}
}

class SubAgent extends Agent{
    constructor(
        name: string,
        description: string,
        public role: AgentRole,
        public instructions: string,
        public memory: Message[],
        public skills: Skill[],
        public task: Task,
        public status: AgentStatus = AgentStatus.Idle
    ){
        super(name, description)
    }
}

class Skill {
    constructor(
        public name: string,
        public description: string,
        public requiredTools: Tool[]
    ) {}
}