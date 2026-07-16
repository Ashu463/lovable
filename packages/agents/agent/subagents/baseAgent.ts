import { E2BSandbox } from "../utils/sandbox";


export abstract class BaseAgent<Tinput, TContext, TLLMResponse, TResult>{
    constructor(
        public userId: string, 
        public projectId: string,
        public sandbox: E2BSandbox,
    ){}
    abstract callLLM(content: Tinput, context: TContext): Promise<TLLMResponse>
    abstract executeFunction(content: TLLMResponse): Promise<TResult | null>
}
