import express from "express";
import cors from "cors";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

import projectRouter from "../src2/modules/project";
import runRouter from "../src2/modules/run";
import userRouter from "../src2/modules/user";
import chatRouter from "../src2/modules/chat";
import designRouter from "../src2/modules/design";
import { questionRouter } from "../src2/modules/question";
import sessionRouter from "../src2/modules/sessions";

import { runQueue } from "./lib/queue";
import { mountGraphQL } from "./graphql/server";
import { logger } from "./lib/utils";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Ported domains are served from /graphql; the REST routers below stay mounted
// until the frontend stops calling them, then get deleted with their src2 file.
await mountGraphQL(app);

app.use("/api/project", projectRouter);
app.use("/api/run", runRouter);
app.use("/api/user", userRouter);
app.use("/api/chat", chatRouter);
app.use("/api/design", designRouter);
app.use("/api/question", questionRouter);
app.use("/internal/session", sessionRouter);

const bullBoardAdapter = new ExpressAdapter();
bullBoardAdapter.setBasePath("/admin/queues");
createBullBoard({
  queues: [new BullMQAdapter(runQueue)],
  serverAdapter: bullBoardAdapter,
});
app.use("/admin/queues", bullBoardAdapter.getRouter());

app.listen(3000, () => {
  logger.info("Server is running on port 3000");
  logger.info("GraphQL on http://localhost:3000/graphql");
  logger.info("BullMQ dashboard on http://localhost:3000/admin/queues");
});
