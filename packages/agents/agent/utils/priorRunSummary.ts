import { b, type Message } from "../../baml_client"
import { AGENT_SUMMARY_PROMPT } from "../config/systemPrompts"
import { logger } from "./logger"
import { observeBaml } from "./tracing"

export async function summarizeIncompleteSession(sessionSnapshotJson: string): Promise<string | null> {
    try {
        const session: Message[] = JSON.parse(sessionSnapshotJson)
        const { summary } = await observeBaml(
            "GenerateAgentSummary",
            { entries: session.length },
            (opts) => b.GenerateAgentSummary(AGENT_SUMMARY_PROMPT, session, opts),
        )
        return summary
    } catch (e) {
        logger.error(`summarizeIncompleteSession failed: ${e instanceof Error ? e.message : String(e)}`)
        return null
    }
}
