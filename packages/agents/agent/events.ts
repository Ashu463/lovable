import type { OrchestratorResponse } from '../types/agentTypes';
import axios from 'axios';
import { BACKEND_URL, REDIS_HOST, REDIS_PORT } from './config/systemConfig';
import IORedis from "ioredis";
export type OrchestratorEvent = MainAgentEvents |
    { type: "orchestrator_agent_started"; }
    | { type: "clarification_needed"; questions: string[] }
    | { type: "main_agent_progress"; step: 'llm_completed' | 'llm_failed' | 'toolCall'; toolCall?: string }
    | { type: "subagent_progress"; agent: string; taskId?: number; data?: unknown, subagentSummary?: string }
    | { type: "subagent_completed"; agent: string; taskId?: number; summary: string }
    | { type: "run_completed"; result: OrchestratorResponse }
    | { type: "run_failed"; taskId?: string, error: string }
    | { type: "orchestrator_completed"; summary: string};

type MainAgentEvents = 
    | {type : 'main_agent_success'}
    | {type: 'main_agent_tool_call', step: number, toolName: string}
export interface EventEmitter {
  emit(event: OrchestratorEvent): Promise<void>;
}

// Every call the agent/worker package makes back to the backend is a
// service-to-service call, not a user request — this is what authenticates it.
export function internalAuthHeader(): Record<string, string>{
    return { Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}` }
}

// Persists every event to Postgres via the backend's internal API, for history/replay.
export function createBackendEmitter(runId: string): EventEmitter{
    return {
        async emit(event: OrchestratorEvent){
            try{
                await axios.post(`${BACKEND_URL}/internal/session/${runId}/events`, event, {
                    headers: internalAuthHeader(),
                    timeout: 5000,
                })
            } catch(err){
                console.error(`Failed to emit event for run ${runId}:`, err)

            }
        }
    }
}

const redisPublisher = new IORedis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    maxRetriesPerRequest: null
});

export function createRedisEmitter(runId: string): EventEmitter{
    return {
        async emit(event: OrchestratorEvent){
            try{
                await redisPublisher.publish(`run:${runId}`, JSON.stringify(event))
            } catch(err){
                console.error(`Failed to publish event for run ${runId}:`, err)
            }
        }
    }
}

export function createRunEmitter(runId: string): EventEmitter{
    const backend = createBackendEmitter(runId)
    const redis = createRedisEmitter(runId)
    return {
        async emit(event: OrchestratorEvent){
            await Promise.all([backend.emit(event), redis.emit(event)])
        }
    }
}