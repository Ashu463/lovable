import { b } from "../../baml_client"
import { SUBAGENT_SUMMARY_PROMPT } from "../config/systemPrompts"
import { logger } from "./logger"
import { observeBaml } from "./tracing"

// A stalled/crashed run's sessionSnapshot could be either shape depending on
// which path was running when it died: the simple Agent's Message[]
// ({role, content, timestamp}), or a complex-path SubAgent's session
// ({taskId, role, status, iterationCount, timestamp, content} — see
// SubAgent.pushSession). This used to assume Message[] via GenerateAgentSummary,
// which silently failed (JSON.parse succeeded, but the shape mismatch made
// BAML's own parse of the result throw, caught and swallowed here as null) on
// any complex-path crash — exactly the case this function exists for.
// GenerateSubagentSummary takes session as a raw string with no shape
// assumption (SubAgent.BuildSummary already calls it this same way on every
// normal completion), so it's the safe choice regardless of which path died.
export async function summarizeIncompleteSession(sessionSnapshotJson: string): Promise<string | null> {
    try {
        const summary = await observeBaml(
            "GenerateSubagentSummary",
            { entries: sessionSnapshotJson.length },
            (opts) => b.GenerateSubagentSummary(SUBAGENT_SUMMARY_PROMPT, "unknown (resumed after a stalled/crashed run)", sessionSnapshotJson, opts),
        )
        return summary
    } catch (e) {
        logger.error(`summarizeIncompleteSession failed: ${e instanceof Error ? e.message : String(e)}`)
        return null
    }
}
