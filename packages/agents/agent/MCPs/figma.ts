import { callMCP } from './registry'

export async function getDesignContext(fileUrl: string): Promise<string> {
  return callMCP("figma", "get_figma_data", { figmaUrl: fileUrl })
}