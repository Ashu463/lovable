import express from "express";
import cors from "cors";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

import { runQueue } from "./lib/queue";
import { mountGraphQL } from "./graphql/server";
import { logger } from "./lib/utils";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

await mountGraphQL(app);

const bullBoardAdapter = new ExpressAdapter();
bullBoardAdapter.setBasePath("/admin/queues");
createBullBoard({
  queues: [new BullMQAdapter(runQueue)],
  serverAdapter: bullBoardAdapter,
});
app.use("/admin/queues", bullBoardAdapter.getRouter());

const PORT = Number(process.env.PORT ?? 3000);

app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
  logger.info(`GraphQL on http://localhost:${PORT}/graphql`);
  logger.info(`BullMQ dashboard on http://localhost:${PORT}/admin/queues`);
});
