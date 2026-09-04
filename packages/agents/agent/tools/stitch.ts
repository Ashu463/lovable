import { Screen, StitchError, stitch } from "@google/stitch-sdk";
import { logger } from "../utils/logger";

type CreateProjectResult = {
  name: string;          // "projects/5539700355047826969"
  origin: string;
  projectType: string;
  title: string;
  visibility: string;
};

export async function makeOneScreen(prompt: string, userId: string): Promise<Screen> {

    let projectResult: CreateProjectResult | undefined;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            projectResult = await stitch.callTool("create_project", { title: userId });
            break;
        } catch (e) {
            if (attempt === 3) throw e;
            const code = e instanceof StitchError ? e.code : "unknown";
            logger.warn(`create_project failed (${code}), retry ${attempt}/2: ${e}`);
            await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        }
    }

    if (!projectResult?.name) {
        throw new Error(`create_project returned unexpected shape: ${JSON.stringify(projectResult)}`);
    }

    // "projects/5539700355047826969" -> "5539700355047826969"
    const projectId = projectResult.name.split("/")[1];
    if(typeof projectId !== 'string' ){
      throw new Error(`project id not worth tupe`)
    }
    logger.info(`Stitch project created: ${projectId}`)
    const project = stitch.project(projectId);

    const screen: Screen = await project.generate(prompt);
    logger.info(`Stitch screen generated: ${screen.screenId}`)

    const [htmlUrl, imageUrl] = await Promise.all([screen.getHtml(), screen.getImage()])
    logger.info(
        `Stitch screen ${screen.screenId} html=${htmlUrl ? "ready" : "pending"} image=${imageUrl ? "ready" : "pending"}`
    )

    return screen;
}


// Polls Stitch until the screen's HTML URL is ready, then fetches it.
// Extracted here so both UIExpert and the Planner design pre-phase share one
// implementation. (UIExpert keeps its own copy until Phase 4 removes it.)
export async function fetchDesignHtml(screen: Screen): Promise<string> {
    let htmlUrl = await screen.getHtml();
    for (let attempt = 1; attempt <= 5 && !htmlUrl; attempt++) {
        logger.warn(`Screen ${screen.screenId} HTML not ready, retrying (${attempt}/5)`);
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
        htmlUrl = await screen.getHtml();
    }
    if (!htmlUrl) {
        throw new Error(`Stitch never returned an HTML URL for screen ${screen.screenId}`);
    }
    const res = await fetch(htmlUrl);
    if (!res.ok) {
        throw new Error(`Failed to fetch HTML for screen ${screen.screenId}: ${res.status} ${res.statusText}`);
    }
    return await res.text();
}

// One-shot: generate a screen and return its HTML. The unit the design
// pre-phase retries and degrades on.
export async function generateScreenHtml(prompt: string, userId: string): Promise<string> {
    const screen = await makeOneScreen(prompt, userId);
    return fetchDesignHtml(screen);
}

// const res = await makeOneScreen("Make black todo screen", "user123")
// console.log(await fetchDesignHtml(res))