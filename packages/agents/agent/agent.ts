import { PrismaClient } from "../generated/prisma/client"
import type { AgentResponse, Message } from "../types/agentTypes"
import { SubAgentStatus, type AgentRole, type Task, type Todo, type Tool } from "../types/types"
import { E2BSandbox } from "./services/sandbox"
import { skills } from "./skills"
import { CoderAgent } from "./subagents/coder"
import { Researcher } from "./subagents/researcher"
// This is the orchestrator agent, and will spawn subagents or main agent depending upon the need
export class Agent{
    constructor(
        public name: string,
        public prompt: string,
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
           let sandbox: E2BSandbox = new E2BSandbox()
           // parse the sandbox to the agent or subagent.
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
        public sandboxId: string
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
        public context: Message[],
        // public skills: Skill[], // TODOs: fix kr bhai isko,
        public sandbox: object,
        public task: Task,
        public status: SubAgentStatus = SubAgentStatus.Idle,
        private prisma: PrismaClient
    ){
        super(name, description)
    }
    async spawnSubAgent(userId: string, agentType: string){
        const user = await this.prisma.user.findUnique({where: {userId}, include:{sandbox: true}})
        let sbId: string = "";
        if(user?.sandbox?.status === 'live'){
            sbId = user.sandbox.sandboxId
        }
        else{
            // create a new sandbox first and update the user as well.
        }
        // sandbox is up, now operate accordingly
        if(agentType === "researcher"){
            let subAgent: Researcher = new Researcher()
        }
        else if(agentType === 'coder'){
            let subAgent: CoderAgent = new CoderAgent(this.prompt, this.context, sbId)
        }

    }
    runLoop(){
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

