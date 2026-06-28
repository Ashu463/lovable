import { MCPClient } from ".";

const ref = new MCPClient("ref", "npx", ["-y", "@ref-tools/ref-tools-mcp"]);

await ref.connect()