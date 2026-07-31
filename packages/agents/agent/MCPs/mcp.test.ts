// Contract tests for the MCP layer. These spawn the real stdio servers but
// never touch a sandbox, an agent loop, or an LLM — so a renamed tool or a
// missing API key surfaces in seconds here instead of forty minutes into a
// paid run, which is how `tavily-search` went unnoticed until it halted a
// debugger task.
//
//   bun test packages/agents/agent/MCPs/mcp.test.ts
//
// Servers are skipped (not failed) when their API key isn't set, so this stays
// runnable without every integration configured.

import { test, expect } from "bun:test";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { callMCP, listServerTools } from "./registry";
import { fetchDocs } from "./context7";

// registry.ts calls dotenv.config() against the CWD, so invoking `bun test`
// from the repo root found no .env and every test skipped — reporting a green
// "0 fail" while checking nothing. Load this workspace's .env by absolute path
// so the suite behaves the same from anywhere.
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env") });

// The tool name each wrapper module actually calls. If a server renames a tool,
// resolveToolName absorbs a separator/case change silently — this table is what
// catches a rename it can't absorb.
const EXPECTED_TOOLS: Record<string, { tools: string[]; apiKey?: string }> = {
    tavily: { tools: ["tavily-search"], apiKey: "TAVILY_API_KEY" },
    context7: { tools: ["resolve-library-id", "query-docs"], apiKey: "CONTEXT7_API_KEY" },
    // The apify server exits at startup without a token rather than reporting
    // an empty tool list, so an unset key has to skip, not fail.
    apify: { tools: ["fetch-actor-details"], apiKey: "APIFY_TOKEN" },
};

const CONNECT_TIMEOUT_MS = 60_000;

for (const [server, { tools, apiKey }] of Object.entries(EXPECTED_TOOLS)) {
    const missingKey = apiKey && !process.env[apiKey];

    test.skipIf(!!missingKey)(
        `${server}: exposes the tools we call`,
        async () => {
            const available = await listServerTools(server);
            expect(available.length).toBeGreaterThan(0);

            // Compare the way resolveToolName does, so a hyphen/underscore
            // rename passes here exactly when it would pass at runtime.
            const normalize = (n: string) => n.toLowerCase().replace(/[-_\s]/g, "");
            const availableNormalized = available.map(normalize);

            for (const tool of tools) {
                expect({
                    tool,
                    available,
                    found: availableNormalized.includes(normalize(tool)),
                }).toMatchObject({ found: true });
            }
        },
        CONNECT_TIMEOUT_MS
    );
}

test.skipIf(!process.env.TAVILY_API_KEY)(
    "tavily: a real search returns non-empty text",
    async () => {
        const result = await callMCP("tavily", "tavily-search", {
            query: "vite dev server allowedHosts",
            max_results: 1,
        });
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
    },
    CONNECT_TIMEOUT_MS
);

// The listTools check above only proves the names exist. fetchDocs also has to
// pass the right arguments and parse an id out of a formatted list — every one
// of those was wrong at once, and only a round trip catches it.
test.skipIf(!process.env.CONTEXT7_API_KEY)(
    "context7: fetchDocs returns real docs, not a resolver dump or an empty string",
    async () => {
        const docs = await fetchDocs("React Router", "nested routes");
        expect(docs.length).toBeGreaterThan(200);
        // The failure mode we just fixed: handing the resolver's own listing
        // back to the caller instead of actual documentation.
        expect(docs).not.toContain("Available Libraries:");
        expect(docs).not.toContain("No Context7 library matched");
    },
    CONNECT_TIMEOUT_MS
);

test("unknown tool names fail with the available list, not a bare -32601", async () => {
    if (!process.env.TAVILY_API_KEY) return;
    await expect(
        callMCP("tavily", "definitely-not-a-real-tool", {})
    ).rejects.toThrow(/exposes no tool matching/);
}, CONNECT_TIMEOUT_MS);
