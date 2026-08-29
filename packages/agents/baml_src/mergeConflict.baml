class ConflictTaskInfo {
  task string
  summary string
}

class MergeConflictContext {
  filePath string
  conflictKind "content" | "deletedByTrunk" | "deletedByTask"
  // "content": the file's current on-disk text, including git's
  // <<<<<<< / ======= / >>>>>>> markers. "deletedByTrunk"/"deletedByTask":
  // whichever side still has the file, its full content.
  conflictText string
  currentTask ConflictTaskInfo
  // Absent when the trunk-side change couldn't be attributed to a specific
  // known task (e.g. it came from an earlier level with no file-level
  // attribution recorded).
  trunkTask ConflictTaskInfo?
}

class MergeConflictResolution {
  resolved bool
  // Final file content to write when resolved=true. Omitted/null means
  // "delete the file" — only meaningful for a deletedByTrunk/deletedByTask
  // kind where deletion is the correct call.
  content string?
  reason string
}

function ResolveMergeConflict(systemPrompt: string, conflict: MergeConflictContext) -> MergeConflictResolution {
    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{conflict}}

        {{ctx.output_format}}
    "#
}
