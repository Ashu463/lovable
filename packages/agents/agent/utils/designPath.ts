export function slugify(text: string, maxLen = 40): string {
    const slug = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, maxLen)
        .replace(/-+$/g, "");
    return slug || "screen";
}

// id is a planner screen id (string, new two-phase planner) or a legacy task
// id (number). Both slug cleanly into a stable path.
export function designFilePath(id: string | number, screenName: string): string {
    return `design/${id}-${slugify(screenName)}.html`;
}


// Path the design pre-phase writes to and the uiExpert reads from, keyed only
// by the planner's screen id (designRef) so the uiExpert can reconstruct it
// without knowing the screen name.
export function designRefPath(designRef: string): string {
    return `design/screen-${designRef}.html`;
}
