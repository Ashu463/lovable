import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../prisma";
import { auth, type AuthRequest } from "./middleware";
import {isValidEmail, isValidPassword, signUserToken,toPublicUser} from "./user.helpers";
import { verifyGoogleIdToken } from "./google";
import { logger } from "./utils";
import { badRequest, conflict, created, notFound, ok, serverError, unauthorized } from "./http";
/*Routes:
POST /users/signup                                → email/password signup
POST /users/login                                 → email/password login
POST /users/google                                → Google ID-token sign-in/signup
GET  /users/me                                     → current user profile
POST /users/logout                                → stateless logout ack
*/

const userRouter = Router();
console.log("User router initialized");
userRouter.post("/signup", async (req: Request, res: Response) => {
    console.log("Signup request received");
    const { email, password, name } = req.body ?? {};

    if (!isValidEmail(email)) {
        console.error(`Invalid email: ${email}`);
        return badRequest(res, "Invalid email");
    }
    if (!isValidPassword(password)) {
        logger.error(`Password is not valid: ${password}`);
        return badRequest(res, "Password must be at least 8 characters");
    }

    try {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            console.error(`Email already registered: ${email}`);
            return conflict(res, "Email already registered");
        }
        const passwordHash = await Bun.password.hash(password);
        const user = await prisma.user.create({
            data: {
                email,
                password: passwordHash,
                name: typeof name === "string" ? name : null,
            },
        });
        const token = signUserToken(user);
        
        console.log("Token created");
        return created(res, { token, user: toPublicUser(user) });
    } catch (e) {
        return serverError(res, `Internal server error: ${e}`);
    }
});

userRouter.post("/login", async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};

    if (!isValidEmail(email) || typeof password !== "string") {
        return badRequest(res, "Invalid email or password");
    }

    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.password) {
            return unauthorized(res, "Invalid email or password");
        }

        const valid = await Bun.password.verify(password, user.password);
        if (!valid) {
            return unauthorized(res, "Invalid email or password");
        }

        const token = signUserToken(user);
        return ok(res, { token, user: toPublicUser(user) });
    } catch (e) {
        return serverError(res);
    }
});

userRouter.post("/google", async (req: Request, res: Response) => {
    const { idToken } = req.body ?? {};

    if (typeof idToken !== "string" || !idToken) {
        return badRequest(res, "Missing idToken");
    }

    try {
        const profile = await verifyGoogleIdToken(idToken);

        let user = await prisma.user.findUnique({
            where: { googleId: profile.googleId },
        });

        if (!user) {
            const existingByEmail = await prisma.user.findUnique({
                where: { email: profile.email },
            });

            if (existingByEmail) {
                user = await prisma.user.update({
                    where: { id: existingByEmail.id },
                    data: { googleId: profile.googleId },
                });
            } else {
                user = await prisma.user.create({
                    data: {
                        email: profile.email,
                        name: profile.name,
                        googleId: profile.googleId,
                        password: null,
                    },
                });
            }
        }

        const token = signUserToken(user);
        return ok(res, { token, user: toPublicUser(user) });
    } catch (e) {
        console.error("Google sign-in failed:", e);
        return unauthorized(res, "Invalid Google token");
    }
});

userRouter.get("/me", auth, async (req: AuthRequest, res: Response) => {
    console.log("Getting user called");
    try {
        console.log("Getting user");
        const user = await prisma.user.findUnique({
            where: { id: req.user!.id },
        });
        if (!user) {
            return notFound(res, "User not found");
        }
        console.log("User found");
        console.log(toPublicUser(user));
        return ok(res, toPublicUser(user));
    } catch (e) {
        console.error(`Error getting user: ${e}`);
        return serverError(res);
    }
});

userRouter.post( "/logout",auth, async (req: AuthRequest, res: Response) => {
        return ok(res, undefined, "Logged out");
    }
);

export default userRouter;
