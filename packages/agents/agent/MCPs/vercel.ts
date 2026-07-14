import { callMCP } from "./registry"

export type DeploymentResult =
  | {
      success: true
      url: string
    }
  | {
      success: false
      stage: string
      error: string
      logs?: string
    }

export async function deployReactApp(
  projectPath: string
): Promise<DeploymentResult> {

  const result = await callMCP(
    "vercel",
    "deploy-react-app",
    {
      projectPath,
      production: true
    }
  )

  return JSON.parse(result)
}