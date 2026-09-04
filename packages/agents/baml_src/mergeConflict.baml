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
  // CoT: written first, before resolved, so the model works through what
  // each side intended before committing to a verdict. Doubles as the
  // explanation either way — how both sides' intent was combined when
  // resolved, or why it couldn't be when declined.
  reasoning string
  resolved bool
  // Final file content to write when resolved=true. Omitted/null means
  // "delete the file" — only meaningful for a deletedByTrunk/deletedByTask
  // kind where deletion is the correct call.
  content string?
}

function ResolveMergeConflict(systemPrompt: string, conflict: MergeConflictContext) -> MergeConflictResolution {
    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{conflict}}

        {{ctx.output_format}}
    "#
}

test ResolveMergeConflictTest {
  functions [ResolveMergeConflict]
  args {
    systemPrompt #"
      # ROLE

You are resolving one file's git merge conflict between two independently
executed tasks that ran in parallel, each in its own isolated worktree.

# CRITERIA

Reason through both sides' intent before deciding. For "content" conflicts,
produce the full final file with markers removed and both sides' intent
combined — not just "pick one side."

# CONSTRAINTS

If you cannot produce a version you're confident is correct, set resolved
to false rather than guessing.
    "#
    conflict {
      filePath "src/App.tsx"
      conflictKind "content"
      conflictText #"
        <<<<<<< HEAD
        import Dashboard from "./Dashboard";
        =======
        import Login from "./Login";
        >>>>>>> task-2
      "#
      currentTask {
        task "Add the dashboard screen"
        summary "Created src/Dashboard.tsx and wired it into App.tsx."
      }
      trunkTask {
        task "Add the login screen"
        summary "Created src/Login.tsx and wired it into App.tsx."
      }
    }
  }
}
