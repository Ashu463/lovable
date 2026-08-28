import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string | null;
}

export async function verifyGoogleIdToken(
  idToken: string
): Promise<GoogleProfile> {
  // TEMP DEBUG — remove once sign-in is confirmed working.
  console.log(`[google] verifying idToken (len=${idToken.length}) against audience=${process.env.GOOGLE_CLIENT_ID ?? "UNSET"}`);
  // verifyIdToken has no built-in timeout — a stuck cert fetch (e.g. a Bun/
  // gaxios fetch-compat quirk, unlike plain curl) hangs this forever with no
  // error at all. Racing it against a timeout turns silence into a diagnosable
  // failure either way.
  const ticket = await Promise.race([
    client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("verifyIdToken timed out after 10s — likely stuck fetching Google's certs")), 10_000),
    ),
  ]);

  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error("Invalid Google token payload");
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name ?? null,
  };
}
