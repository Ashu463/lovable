import type { AgentResponse, Message } from "../types/agentTypes"
import { SubAgentStatus, type AgentRole, type Task, type Todo, type Tool } from "../types/types"
import { skills } from "./skills"
import { Researcher } from "./subagents/researcher"


// This is the orchestrator agent, and will spawn subagents or main agent depending upon the need
export class Agent{
    constructor(
        public name: string,
        public description: string,
        public todos?: Todo[]
    ){
    }
    execute(prompt: string, context: Message[]): Promise<AgentResponse>{
        
        if(this.todos!.length > 0){
            /* Sub agent would be spawned based upon the skills you have, 
                and the divided task. 
            - get tasks list, do topo sort on it and arrange it. 
            - do somehow parallel execution made in that queue [{A}, {B, X}, {D, E}, {C}]
            then in that case B and X should be executed parallely and so on
            */
            let s: SubAgent = new SubAgent()
            s.spawnSubAgent() 
        }
        else{
            let m: MainAgent = new MainAgent("title", "desc", prompt, context, skills)
            m.spawnMainAgent()
        }
    }
    
    
    
}
// This one would be triggered when there will be no sub agents
class MainAgent extends Agent{
    constructor(
        name: string, 
        description: string, 
        public prompt: string, 
        public context: Message[],
        public skills: Skill[],
    ){
        super(name, description)
    }
    spawnMainAgent(){
        this.runLoop()
        this.deployPipeline()
        this.epilouge()
    }
    runLoop(){
        /* Steps: 
        - frame prompt
        - fetch context 
        - parse skills 
        - make LLM calls
        - spin up a sandbox 
        - execute tool calls if any, write into sandbox if needed.
        - store regular snapshot of sandbox in file storage
        - loop this thing
        */
    }
    deployPipeline(){
        /*Steps: krta hu ruko


        */
    }
    epilouge(){

    }
}

export class SubAgent extends Agent{
    constructor(
        name: string,
        description: string,
        public role: AgentRole,
        public instructions: string,
        public memory: Message[],
        public skills: Skill[], // TODOs: fix kr bhai isko
        public task: Task,
        public status: SubAgentStatus = SubAgentStatus.Idle
    ){
        super(name, description)
    }
    spawnSubAgent(){
        if(this.name === "researcher"){
            let subAgent: Researcher = new Researcher()

        }
    }
    runLoop(subagent: ){
        /*Steps: 
        
        - Now for single execution of each task
            - make the LLM Call with given skills, it returns the output
            - execute those skills call
            - parse back to LLM, loop it. 
            - execute tool calls, 
            - spin up the sandbox and write into it. 
            - keep snapshotting the sandbox
            - loop this thing.

        */
    }
}

