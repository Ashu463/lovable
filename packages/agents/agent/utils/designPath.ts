export function slugify(text: string, maxLen = 40): string {
    const slug = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, maxLen)
        .replace(/-+$/g, "");
    return slug || "screen";
}

export function designFilePath(taskId: number, screenName: string): string {
    return `design/${taskId}-${slugify(screenName)}.html`;
}
