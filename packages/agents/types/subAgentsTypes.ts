
export interface DebuggerLLMResponse{
    stopReason: string,
    toolCall?: ReadFile | RunCommand | WriteFile | DebuggingDone | Research
}