import {EventEmitter as NodeEventEmitter} from 'events'
import type { OrchestratorEvent } from '../../../packages/agents'

const buses = new Map<string, NodeEventEmitter>()

export function getBus(runId: string): NodeEventEmitter{
    if(!buses.has(runId)) buses.set(runId, new NodeEventEmitter())
    
    return buses.get(runId)
}
export function publishToRun(runId: string, event: OrchestratorEvent){
    getBus(runId).emit("Event", event)

}
export function closeRun(runId: string){
    buses.get(runId).removeAllListeners()
    buses.delete(runId)
}