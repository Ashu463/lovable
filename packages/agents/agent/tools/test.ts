import dotenv from "dotenv";
dotenv.config();
// run this root where .env is present 
import { stitch } from "@google/stitch-sdk";

async function test() {
  console.log("STITCH_API_KEY exists:", !!process.env.STITCH_API_KEY);

  const result = await stitch.callTool("create_project", {
    title: "test-project",
  });

  console.log(result);
}

test().catch(console.error);