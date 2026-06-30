import dotenv from 'dotenv'
dotenv.config()
import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

type ServerConfig = {
    command: string, 
    args: string[],
    env?: string
}

const SERVER_CONFIGS: Record<string, ServerConfig> = {
    tavily:{
        command: "npx",
        args: ["-y", "tavily-mcp@latest"],
        env: process.env.TAVILY_API_KEY
    },
    figma: {
        command: "npmx",
        args: ["-y", "figma-developer-mcp", "--studio"],
        env: process.env.FIGMA_API_KEY
    },
    context7: {
        command: "npx",
        args: ["-y", "@upstash/context-7-mcp@latest"],
        env: process.env.CONTEXT7_API_KEY
    },
    stitch: {
        command: "node",
        args: ["./servers/stitch-server.js"],
        env: process.env.GOOGLE_API_KEY
    },
    apify:{
        command: "npx",
        args: ["-y", "@apify/actors-mcp-server"]
    }
}
const clients : Map<string, Client> = new Map()
async function getClient(serverName: string) : Promise<Client>{
    if(clients.has(serverName)) return clients.get(serverName)!

    const config = SERVER_CONFIGS[serverName]
    if(!config) throw new Error("Unknow MCP server error")

    const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env:  {
            ...process.env as Record<string, string>
        }
    })
    const client = new Client({
        name: `${serverName}-client`, 
        version: "1.0.0"
    })
    await client.connect(transport)
    clients.set(serverName, client)
    return client
}

export async function callMCP(server: string, tool: string, args: Record<string, unknown>): Promise<string>{
    const client = await getClient(server)
    const result = await client.callTool({name: tool, arguments: args})

    const  content = result.content as {type: string, text: string}[]
    return content[0]?.text ?? ""
}