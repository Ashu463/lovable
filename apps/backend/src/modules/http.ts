import type { Response } from "express";

/*
Shared JSON envelope + param validation used by every router. Every handler
returns {success, message?, data?}, so the shape lives here instead of being
re-spelled at each call site.
*/

export function ok<T>(res: Response, data?: T, message?: string) {
    return res.status(200).json({ success: true, ...(message !== undefined ? { message } : {}), ...(data !== undefined ? { data } : {}) });
}

export function created<T>(res: Response, data?: T, message?: string) {
    return res.status(201).json({ success: true, ...(message !== undefined ? { message } : {}), ...(data !== undefined ? { data } : {}) });
}

export function fail(res: Response, status: number, message: string) {
    return res.status(status).json({ success: false, message });
}

export const badRequest = (res: Response, message = "Invalid params") => fail(res, 400, message);
export const unauthorized = (res: Response, message = "Unauthorized") => fail(res, 401, message);
export const forbidden = (res: Response, message = "Forbidden") => fail(res, 403, message);
export const notFound = (res: Response, message = "Not found") => fail(res, 404, message);
export const conflict = (res: Response, message: string) => fail(res, 409, message);
export const serverError = (res: Response, message = "Internal server error") => fail(res, 500, message);

/*
Validates that every value is a string and hands back the narrowed record, or
responds 400 and returns null:

    const p = requireStrings(res, { projectId, runId });
    if (!p) return;
    // p.projectId / p.runId are strings here
*/
export function requireStrings<K extends string>(
    res: Response,
    values: Record<K, unknown>,
    message?: string,
): Record<K, string> | null {
    const invalid = (Object.keys(values) as K[]).filter((key) => typeof values[key] !== "string");
    if (invalid.length > 0) {
        badRequest(res, message ?? (invalid.length === 1 ? `Invalid ${invalid[0]}` : "Invalid params"));
        return null;
    }
    return values as Record<K, string>;
}
