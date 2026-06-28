import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export class MCPClient {
    private client!: Client
    constructor(
        private name: string,
        private command: string,
        private args: string[],
    ) {}

    async connect(){
        const transport = new StdioClientTransport({
            command: this.command,
            args: this.args
        })

        this.client = new Client({
            name: this.name,
            version: "1.0.0"
        })
        await this.client.connect(transport)
    }

    async listTools(){
        return await this.client.listTools()
    }

    async callTool(name: string, args: unknown){
        return this.client.callTool({
            name, 
            arguments: args
        })
    }
}