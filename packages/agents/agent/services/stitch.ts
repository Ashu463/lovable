import dotenv from 'dotenv'
dotenv.config()
import { stitch, Screen, StitchToolClient } from "@google/stitch-sdk";

type CreateProjectResult = {
  project?: {
    projectId: string;
    title?: string;
  };
};


export async function makeOneScreen(prompt: string, userId: string): Promise<Screen> {
    const projectResult: CreateProjectResult = await stitch.callTool("create_project", {
      title: userId,
    });

    const projectId = projectResult.project!.projectId;

    // generate screen
    const project = stitch.project(projectId);

    const screen: Screen = await project.generate(prompt);

    const htmlUrl = await screen.getHtml();
    const imageUrl = await screen.getImage();

    console.log({ htmlUrl, imageUrl });
    return screen
}

// future scope
export async function makeMultipleScreens(){

}