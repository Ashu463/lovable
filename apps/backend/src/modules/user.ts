import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../prisma";
import { auth, type AuthRequest } from "./middleware";
import {isValidEmail, isValidPassword, signUserToken,toPublicUser} from "./user.helpers";
import { verifyGoogleIdToken } from "./google";
/*Routes:
POST /users/signup                                → email/password signup
POST /users/login                                 → email/password login
POST /users/google                                → Google ID-token sign-in/signup
GET  /users/me                                     → current user profile
POST /users/logout                                → stateless logout ack
*/

const userRouter = Router();

userRouter.post("/signup", async (req: Request, res: Response) => {
    const { email, password, name } = req.body ?? {};

    if (!isValidEmail(email)) {
        return res.status(400).json({ success: false, message: "Invalid email" });
    }
    if (!isValidPassword(password)) {
        return res.status(400).json({
            success: false,
            message: "Password must be at least 8 characters",
        });
    }

    try {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return res
                .status(409)
                .json({ success: false, message: "Email already registered" });
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
        return res
            .status(201)
            .json({ success: true, data: { token, user: toPublicUser(user) } });
    } catch (e) {
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
});

userRouter.post("/login", async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};

    if (!isValidEmail(email) || typeof password !== "string") {
        return res
            .status(400)
            .json({ success: false, message: "Invalid email or password" });
    }

    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.password) {
            return res
                .status(401)
                .json({ success: false, message: "Invalid email or password" });
        }

        const valid = await Bun.password.verify(password, user.password);
        if (!valid) {
            return res
                .status(401)
                .json({ success: false, message: "Invalid email or password" });
        }

        const token = signUserToken(user);
        return res
            .status(200)
            .json({ success: true, data: { token, user: toPublicUser(user) } });
    } catch (e) {
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
});

userRouter.post("/google", async (req: Request, res: Response) => {
    const { idToken } = req.body ?? {};

    if (typeof idToken !== "string" || !idToken) {
        return res
            .status(400)
            .json({ success: false, message: "Missing idToken" });
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
        return res
            .status(200)
            .json({ success: true, data: { token, user: toPublicUser(user) } });
    } catch (e) {
        return res
            .status(401)
            .json({ success: false, message: "Invalid Google token" });
    }
});

userRouter.get("/me", auth, async (req: AuthRequest, res: Response) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user!.id },
        });
        if (!user) {
            return res
                .status(404)
                .json({ success: false, message: "User not found" });
        }
        return res.status(200).json({ success: true, data: toPublicUser(user) });
    } catch (e) {
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
});

userRouter.post(
    "/logout",
    auth,
    async (_req: AuthRequest, res: Response) => {
        return res.status(200).json({ success: true, message: "Logged out" });
    }
);

export default userRouter;
