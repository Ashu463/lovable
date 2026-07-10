import type { Message } from "../../baml_client";
import { E2BSandbox } from "../utils/sandbox";


export abstract class BaseAgent<Tinput, TLLMResponse, TResult>{
    protected sandbox: E2BSandbox
    constructor(
        public userId: string, 
        public projectId: string,
        public sandboxId: string,
    ){
        this.sandbox = new E2BSandbox()
    }
    abstract callLLM(content: Tinput, context: Message[]): Promise<TLLMResponse>
    abstract executeFunction(content: TLLMResponse): Promise<TResult | null>
}
