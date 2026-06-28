import { CODER_PROMPT } from "../config";
import {b, type CoderContext, type CoderResponse, type Done, type FetchInfo, type FileEdit, type Research, type RunCommand, type WriteFile} from '../../baml_client'
import { SandboxMCP } from "../MCPs/sandbox";
import { BraveMCP } from "../MCPs/brave";
import { RefMCP } from "../MCPs/ref";
import { BashTool } from "../tools/bashTool";
import { Researcher } from "./researcher";

export class CoderAgent{

    constructor(
        public prompt: string, 
        public context: CoderContext[] = [],
        public boilerPlate?: string
        // it can get 
    ){}

    async run(): Promise<WriteFile | RunCommand | FetchInfo | Done>{
        let response: WriteFile | RunCommand | FetchInfo | Done | Research
    
        const sandbox: SandboxMCP = new SandboxMCP()
        const brave: BraveMCP = new BraveMCP()
        const refMCP: RefMCP = new RefMCP()
        const researchAgent: Researcher = new Researcher()
        let context: CoderContext[] = []
        // TODO: intially pushing to the context, make this to fetch from the memory about relevant context.
        while(true){

            try{
                response = await b.CoderAgent(this.prompt, CODER_PROMPT, this.boilerPlate, this.context)

                if(response.action === 'writeFile'){
                    const writeRes: CoderContext = await sandbox.writeFile(response.path, response.content)
                    context.push(writeRes)
                }
                else if(response.action === 'runCommand'){
                    const runCommand: CoderContext = await BashTool(response.command)
                    context.push(runCommand)
                }
                else if(response.action === 'fetchInformation'){
                    const fetchInfo: CoderContext = await refMCP.search(response.query, response.library)
                    context.push(fetchInfo)
                }
                else if(response.action === 'research'){
                    const research = await researchAgent.Search(response.query, "webSearch")
                    context.push(research)
                }
                else if(response.action === 'done'){
                    return response
                }
            }
            catch(e){
                throw new Error("Error occurred")
            }

            
        }

    }
}