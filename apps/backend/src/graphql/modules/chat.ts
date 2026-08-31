import { GraphQLError } from "graphql";
import { randomUUIDv7 } from "bun";
import type { GraphQLContext } from "../context";
import { requireUser } from "../context";
import { loadOwnedProject, loadOwnedRun, loadOwnedRunById } from "../authz";
import { runQueue } from "../../lib/queue";
import { logger } from "../../lib/utils";


export const chatResolvers = {
  Query: {
    runState: async (
      _parent: unknown,
      args: { runId: string },
      ctx: GraphQLContext,
    ) => {
      const run = await loadOwnedRunById(ctx, args.runId);

      // Each status has one event type worth replaying; anything else has no
      // pending UI to restore.
      const eventTypeForStatus: Record<string, string> = {
        CLARIFICATION_NEEDED: "clarification_needed",
        AWAITING_DESIGN_SELECTION: "select_design",
        AWAITING_UI_PREFERENCE: "ui_preference_needed",
        COMPLETED: "run_completed",
        FAILED: "run_failed",
      };

      let payload: unknown = null;
      const type = eventTypeForStatus[run.status];
      if (type) {
        const event = await ctx.prisma.runEvent.findFirst({
          where: { runId: run.id, type },
          orderBy: { createdAt: "desc" },
        });
        payload = event?.content ? JSON.parse(event.content) : null;
      }

      const paused =
        run.status === "CLARIFICATION_NEEDED" ||
        run.status === "AWAITING_DESIGN_SELECTION" ||
        run.status === "AWAITING_UI_PREFERENCE";

      // A run only leaves IN_PROGRESS when the agent emits a terminal event, so
      // a worker restart or a job that died mid-flight leaves the row building
      // forever. The queue is the source of truth for whether work is pending:
      // waiting/active/delayed covers every state a job can be in before it
      // reaches the worker, so finding none means nothing will advance this run.
      let stalled = false;
      if (run.status === "IN_PROGRESS") {
        const pending = await runQueue.getJobs(["waiting", "active", "delayed"]);
        stalled = !pending.some((job) => job.data?.runId === run.id);
      }

      const project = await ctx.prisma.project.findUnique({
        where: { id: run.projectId },
        select: { name: true },
      });

      return {
        runId: run.id,
        projectId: run.projectId,
        userPrompt: run.userPrompt,
        projectName: project?.name ?? null,
        status: run.status,
        stalled,
        pauseEvent: paused ? payload : null,
        completedEvent: run.status === "COMPLETED" ? payload : null,
        failedEvent: run.status === "FAILED" ? payload : null,
      };
    },
  },

  Mutation: {
    createRun: async (
      _parent: unknown,
      args: { projectId?: string | null; userPrompt: string; sandboxId?: string | null },
      ctx: GraphQLContext,
    ) => {
      // Identity comes from the verified token — the REST route read it from a
      // client-supplied `userid` header, which any caller could set freely.
      const user = requireUser(ctx);

      if (!args.userPrompt.trim()) {
        throw new GraphQLError("userPrompt must not be empty", {
          extensions: { code: "BAD_USER_INPUT", http: { status: 400 } },
        });
      }

      const projectId = args.projectId
        ? (await loadOwnedProject(ctx, args.projectId)).id
        : (
            await ctx.prisma.project.create({
              data: { id: randomUUIDv7(), userId: user.id },
            })
          ).id;

      let sandboxId = args.sandboxId ?? null;
      if (args.projectId && !sandboxId) {
        // Reuse the last completed run's sandbox if the caller didn't hand
        // one in — narrative continuity (priorRunSummary) used to be fetched
        // here too, but that value never survived a continueRun re-enqueue
        // (see packages/agents/agent/callAgent.ts::loadProjectContext, which
        // fetches it live instead, correctly, on every Execute() call).
        const lastRun = await ctx.prisma.run.findFirst({
          where: { projectId, status: "COMPLETED" },
          orderBy: { startedAt: "desc" },
          select: { sandboxId: true },
        });
        sandboxId = lastRun?.sandboxId ?? null;
      }

      const run = await ctx.prisma.run.create({
        data: {
          id: randomUUIDv7(),
          projectId,
          sandboxId,
          userPrompt: args.userPrompt,
        },
      });

      const owner = await ctx.prisma.user.findUnique({ where: { id: user.id } });
      if (!owner) {
        throw new GraphQLError("User not found", {
          extensions: { code: "NOT_FOUND", http: { status: 404 } },
        });
      }

      try {
        await runQueue.add("run", {
          userId: user.id,
          projectId,
          prompt: args.userPrompt,
          runId: run.id,
          semanticMem: owner.semanticMem,
          sandboxId,
        });
        logger.info(`Enqueued run ${run.id}`);
      } catch (e) {
        logger.error(`Failed to enqueue run ${run.id}: ${e}`);
        throw new GraphQLError("Failed to start run", {
          extensions: { code: "INTERNAL_SERVER_ERROR", http: { status: 500 } },
        });
      }

      return run;
    },

    continueRun: async (
      _parent: unknown,
      args: {
        projectId: string;
        runId: string;
        answers: { question: string; answer: string }[];
        selectedDesignId?: string | null;
        uiPreferenceAnswers: { questionId: string; answer: string }[];
      },
      ctx: GraphQLContext,
    ) => {
      const user = requireUser(ctx);
      const run = await loadOwnedRun(ctx, args.projectId, args.runId);

      if (
        run.status !== "CLARIFICATION_NEEDED" &&
        run.status !== "AWAITING_DESIGN_SELECTION" &&
        run.status !== "AWAITING_UI_PREFERENCE"
      ) {
        throw new GraphQLError(`Run ${run.id} isn't awaiting input`, {
          extensions: { code: "CONFLICT", http: { status: 409 } },
        });
      }

      const owner = await ctx.prisma.user.findUnique({ where: { id: user.id } });
      if (!owner) {
        throw new GraphQLError("User not found", {
          extensions: { code: "NOT_FOUND", http: { status: 404 } },
        });
      }

      // Answers arrive keyed by question text (AgentAnswerInput), so they're
      // matched back to the saved rows here. Without this the answers only
      // ever lived in this one job payload and were lost the moment the run
      // paused again for a UI preference.
      for (const given of args.answers) {
        const question = await ctx.prisma.question.findFirst({
          where: { projectId: args.projectId, question: given.question },
          orderBy: { createdAt: "desc" },
        });
        if (!question) continue;
        await ctx.prisma.answers.upsert({
          where: { questionId: question.id },
          create: {
            id: randomUUIDv7(),
            runId: run.id,
            questionId: question.id,
            questionText: question.question,
            answer: given.answer,
            answeredAt: new Date(),
          },
          update: { answer: given.answer, answeredAt: new Date() },
        });
      }

      // Persisted here (not just passed through job data) so they're fetchable
      // by every future run on this project, not just this one.
      for (const pref of args.uiPreferenceAnswers) {
        const question = await ctx.prisma.uIPreferenceQuestion.findFirst({
          where: { id: pref.questionId, projectId: args.projectId },
        });
        if (!question) {
          throw new GraphQLError(`UI preference question ${pref.questionId} not found`, {
            extensions: { code: "NOT_FOUND", http: { status: 404 } },
          });
        }
        await ctx.prisma.uIPreferenceAnswer.upsert({
          where: { questionId: pref.questionId },
          create: {
            id: randomUUIDv7(),
            projectId: args.projectId,
            questionId: pref.questionId,
            questionText: question.question,
            answer: pref.answer,
            answeredAt: new Date(),
          },
          update: { answer: pref.answer, answeredAt: new Date() },
        });
      }

      const resumed = await ctx.prisma.run.update({
        where: { id: run.id },
        data: { status: "IN_PROGRESS" },
      });

      try {
        await runQueue.add("run", {
          userId: user.id,
          projectId: args.projectId,
          prompt: run.userPrompt,
          runId: run.id,
          semanticMem: owner.semanticMem,
          sandboxId: run.sandboxId,
          answers: args.answers,
          selectedDesignId: args.selectedDesignId ?? null,
        });
        logger.info(`Continuing run ${run.id}`);
      } catch (e) {
        logger.error(`Failed to re-enqueue run ${run.id}: ${e}`);
        // Put the run back where it was so the client can retry, rather than
        // leaving it stuck IN_PROGRESS with nothing working on it.
        await ctx.prisma.run.update({
          where: { id: run.id },
          data: { status: run.status },
        });
        throw new GraphQLError("Failed to continue run", {
          extensions: { code: "INTERNAL_SERVER_ERROR", http: { status: 500 } },
        });
      }

      return resumed;
    },
  },
};
