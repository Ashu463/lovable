import { callMCP } from './registry'

export async function makeBoilerPlate(fileUrl: string): Promise<string> {
  return callMCP("figma", "get_figma_data", { figmaUrl: fileUrl })
}