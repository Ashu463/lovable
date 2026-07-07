import type { MainLLMResponse } from "../types/mainAgentTypes"
import { MAX_ITERATIONS } from "./config/systemConfig"

class MainAgent{
    public iterations: number
    public masterContext: string[]
    constructor(
        public userPrompt: string,
        public userId: string, 
        public sandboxId: string
    ){ 
        this.iterations = 0
        this.masterContext = []
    }
    async spawnMainAgent(){
        this.runLoop()
        this.syncToR2()
        // push to github
        this.deployPipeline()
        this.epilouge()
    }
    async runLoop(){
        /* Steps: 
        - frame prompt
        - fetch context 
        - parse skills 
        - make LLM calls
        - spin up a sandbox 
        - execute tool calls if any, write into sandbox if needed.
        - store regular snapshot of sandbox in file storage
        - loop this thing

        -------updated flow of main agent --------
        - share the relevant memory along with user propmt
        - do the LLM call, assuming system prompt to be too much mature
        - execute whatever is the tool call
            - Sandbox tools would be read, write, bash, edit, 
            - sync with R2. 
            - and MCPs with proper documentation what to call with all the 
                parameteres 
            - normal tools qna tool

        - always share the update to the backend
        - update the context and memory
        - can we push to github after each iteration of the loop? 
        - 
        */
        let hasMoreToolCalls = true
        while(hasMoreToolCalls || this.iterations < MAX_ITERATIONS){
            
            const context: string = await this.buildContext(this.userPrompt)
            
            const response: MainLLMResponse = await this.callLLM(context);

            if(response.status === 'completed') break;

            
            const toolResult = await this.executeTool(response.toolCall)
            
            await this.syncToR2()           // checkpoint file state
            await this.emitSSEUpdate()      // tell backend what just happened
            await this.saveSessionState()   // write to Postgres — failure recovery
            await this.updateContext() 
        }
    }
    async buildContext(){

    }
    async callLLM(context: string){

    }
    async executeToolCall(){

    }
    async syncToR2(){

    }
    async emitSSEUpdate(){

    }
    async saveSessionState(){

    }
    async updateContext(){

    }
    deployPipeline(){
        /*Steps: krta hu ruko


        */
    }
    epilouge(){

    }
}