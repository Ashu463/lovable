import { Screen, stitch } from "@google/stitch-sdk";

type CreateProjectResult = {
  name: string;          // "projects/5539700355047826969"
  origin: string;
  projectType: string;
  title: string;
  visibility: string;
};

export async function makeOneScreen(prompt: string, userId: string): Promise<Screen> {
    const projectResult: CreateProjectResult = await stitch.callTool("create_project", {
      title: userId,
    });

    console.dir(projectResult, { depth: null });

    if (!projectResult?.name) {
        throw new Error(`create_project returned unexpected shape: ${JSON.stringify(projectResult)}`);
    }

    // "projects/5539700355047826969" -> "5539700355047826969"
    const projectId = projectResult.name.split("/")[1];
    if(typeof projectId !== 'string' ){
      throw new Error(`project id not worth tupe`)
    }
    const project = stitch.project(projectId);

    const screen: Screen = await project.generate(prompt);
    console.log(screen, " is the complete screen by stitch");

    const htmlUrl = await screen.getHtml();
    const imageUrl = await screen.getImage();

    console.log({ htmlUrl, imageUrl });
    return screen;
}


// const res = await makeOneScreen("Make black todo screen", "user123")
// console.log(await fetchDesignHtml(res))