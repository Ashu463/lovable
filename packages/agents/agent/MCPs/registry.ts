import dotenv from 'dotenv'
dotenv.config()
import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

type ServerConfig = {
    command: string, 
    args: string[],
    // Names (not values) of the env vars this server needs — only these are
    // forwarded, so a third-party MCP process never sees our DB URL, JWT
    // secret, R2 keys or other providers' tokens.
    envKeys?: string[]
}

const BASE_ENV_KEYS = ["PATH", "HOME", "NODE_ENV", "TMPDIR"]

function serverEnv(envKeys: string[] = []): Record<string, string>{
    const env: Record<string, string> = {}
    for(const key of [...BASE_ENV_KEYS, ...envKeys]){
        const value = process.env[key]
        if(value !== undefined) env[key] = value
    }
    return env
}

const SERVER_CONFIGS: Record<string, ServerConfig> = {
    tavily:{
        command: "npx",
        args: ["-y", "tavily-mcp@latest"],
        envKeys: ["TAVILY_API_KEY"]
    },
    figma: {
        command: "npmx",
        args: ["-y", "figma-developer-mcp", "--studio"],
        envKeys: ["FIGMA_API_KEY"]
    },
    context7: {
        command: "npx",
        args: ["-y", "@upstash/context-7-mcp@latest"],
        envKeys: ["CONTEXT7_API_KEY"]
    },
    stitch: {
        command: "node",
        args: ["./services/stitch-server.js"],
        envKeys: ["STITCH_API_KEY"]
    },
    apify:{
        command: "npx",
        args: ["-y", "@apify/actors-mcp-server"]
    },
    vercel: {
        command: "npx",
        args: ["-y", "vercel-mcp-server"],
        envKeys: ["VERCEL_TOKEN"]
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
        env: serverEnv(config.envKeys)
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