import type { Message } from "../../baml_client";
import type { SubAgentsContext } from "../../types/subAgentsTypes";
import { E2BSandbox } from "../utils/sandbox";


export abstract class BaseAgent<Tinput, TContext, TLLMResponse, TResult>{
    protected sandbox: E2BSandbox
    constructor(
        public userId: string, 
        public projectId: string,
        public sandboxId: string,
    ){
        this.sandbox = new E2BSandbox()
    }
    abstract callLLM(content: Tinput, context: TContext): Promise<TLLMResponse>
    abstract executeFunction(content: TLLMResponse): Promise<TResult | null>
}
