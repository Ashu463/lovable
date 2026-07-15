import type { OrchestratorResponse } from '../types/agentTypes';
import axios from 'axios';
import { BACKEND_URL } from './config/systemConfig';

export type OrchestratorEvent =
    { type: "orchestrator_agent_started"; }
    | { type: "clarification_needed"; questions: string[] }
    | { type: "main_agent_progress"; step: 'llm_completed' | 'llm_failed' | 'toolCall'; toolCall?: string }
    | { type: "subagent_progress"; agent: string; taskId?: number; data?: unknown, subagentSummary?: string }
    | { type: "subagent_completed"; agent: string; taskId?: number; summary: string }
    | { type: "run_completed"; result: OrchestratorResponse }
    | { type: "run_failed"; taskId?: string, error: string }
    | { type: "orchestrator_completed"; summary: string};

export interface EventEmitter {
  emit(event: OrchestratorEvent): Promise<void>;
}

export function createBackendEmitter(runId: string): EventEmitter{
    return {
        async emit(event: OrchestratorEvent){
            try{
                await axios.post(`${BACKEND_URL}/internal/sessions/${runId}/events`, event, {
                    headers: { Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}` },
                    timeout: 5000,
                })
            } catch(err){
                console.error(`Failed to emit event for run ${runId}:`, err)

            }
        }
    }
}

export function createStreamingEmitter(runId: string){

}