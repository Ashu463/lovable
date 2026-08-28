import { GraphQLError } from "graphql";
import type { GraphQLContext } from "../context";
import { requireUser } from "../context";
import {
  isValidEmail,
  isValidPassword,
  signUserToken,
  toPublicUser,
} from "../../lib/user.helpers";
import { verifyGoogleIdToken } from "../../lib/google";
import { logger } from "../../lib/utils";


export const userResolvers = {
  Query: {
    me: async (_parent: unknown, _args: unknown, ctx: GraphQLContext) => {
      const authed = requireUser(ctx);

      const user = await ctx.prisma.user.findUnique({ where: { id: authed.id } });
      if (!user) {
        throw new GraphQLError("User not found", {
          extensions: { code: "NOT_FOUND", http: { status: 404 } },
        });
      }
      return toPublicUser(user);
    },
  },

  Mutation: {
    signup: async (
      _parent: unknown,
      args: { email: string; password: string; name?: string | null },
      ctx: GraphQLContext,
    ) => {
      const { email, password, name } = args;

      if (!isValidEmail(email)) {
        throw new GraphQLError("Invalid email", {
          extensions: { code: "BAD_USER_INPUT", http: { status: 400 } },
        });
      }
      if (!isValidPassword(password)) {
        throw new GraphQLError("Password must be at least 8 characters", {
          extensions: { code: "BAD_USER_INPUT", http: { status: 400 } },
        });
      }

      const existing = await ctx.prisma.user.findUnique({ where: { email } });
      if (existing) {
        throw new GraphQLError("Email already registered", {
          extensions: { code: "CONFLICT", http: { status: 409 } },
        });
      }

      const user = await ctx.prisma.user.create({
        data: {
          email,
          password: await Bun.password.hash(password),
          name: typeof name === "string" ? name : null,
        },
      });

      return { token: signUserToken(user), user: toPublicUser(user) };
    },

    login: async (
      _parent: unknown,
      args: { email: string; password: string },
      ctx: GraphQLContext,
    ) => {
      const { email, password } = args;

      // One generic message for every failure mode, so this can't be used to
      // probe which emails are registered.
      const invalid = () =>
        new GraphQLError("Invalid email or password", {
          extensions: { code: "UNAUTHENTICATED", http: { status: 401 } },
        });

      if (!isValidEmail(email)) throw invalid();

      const user = await ctx.prisma.user.findUnique({ where: { email } });
      if (!user?.password) throw invalid();

      if (!(await Bun.password.verify(password, user.password))) throw invalid();

      return { token: signUserToken(user), user: toPublicUser(user) };
    },

    googleSignIn: async (
      _parent: unknown,
      args: { idToken: string },
      ctx: GraphQLContext,
    ) => {
      // TEMP DEBUG — remove once sign-in is confirmed working.
      logger.info(`googleSignIn resolver hit, idToken length=${args.idToken?.length ?? "none"}`);
      let profile;
      try {
        profile = await verifyGoogleIdToken(args.idToken);
      } catch (e) {
        logger.error(`Google sign-in failed: ${e instanceof Error ? e.stack ?? e.message : e}`);
        throw new GraphQLError("Invalid Google token", {
          extensions: { code: "UNAUTHENTICATED", http: { status: 401 } },
        });
      }

      // TEMP DEBUG — remove once sign-in is confirmed working.
      logger.info(`Google token verified for ${profile.email}, querying Postgres now`);
      let user = await ctx.prisma.user.findUnique({
        where: { googleId: profile.googleId },
      });
      // TEMP DEBUG — remove once sign-in is confirmed working.
      logger.info(`Postgres lookup done, user found=${!!user}`);

      if (!user) {
        // An account may already exist from email/password signup — link the
        // Google identity to it rather than creating a duplicate.
        const existingByEmail = await ctx.prisma.user.findUnique({
          where: { email: profile.email },
        });

        user = existingByEmail
          ? await ctx.prisma.user.update({
              where: { id: existingByEmail.id },
              data: { googleId: profile.googleId },
            })
          : await ctx.prisma.user.create({
              data: {
                email: profile.email,
                name: profile.name,
                googleId: profile.googleId,
                password: null,
              },
            });
      }

      return { token: signUserToken(user), user: toPublicUser(user) };
    },

    logout: async (_parent: unknown, _args: unknown, ctx: GraphQLContext) => {
      requireUser(ctx);
      return true;
    },
  },
};
