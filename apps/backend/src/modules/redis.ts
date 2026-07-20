import IORedis from "ioredis";

export const redis = new IORedis({
    host: process.env.REDIS_HOST ?? "redis",
    port: Number(process.env.REDIS_PORT ?? 6379),
    maxRetriesPerRequest: null
});

redis.on("error", (err) => {
    console.error("Redis Error:", err);
});