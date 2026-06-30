-- CreateEnum
CREATE TYPE "SBStatus" AS ENUM ('live', 'down');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('inQueue', 'processing', 'completed');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('User', 'LLM');

-- CreateEnum
CREATE TYPE "Agent" AS ENUM ('Coder', 'Debugger', 'Researcher', 'UiExpert', 'Tester');

-- CreateTable
CREATE TABLE "User" (
    "userId" TEXT NOT NULL,
    "previewUrl" TEXT NOT NULL,
    "s3Id" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Sandbox" (
    "sandboxId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "SBStatus" NOT NULL,

    CONSTRAINT "Sandbox_pkey" PRIMARY KEY ("sandboxId")
);

-- CreateTable
CREATE TABLE "Todo" (
    "id" TEXT NOT NULL,
    "todo" TEXT NOT NULL,
    "status" "Status" NOT NULL,
    "assignedAgent" "Agent" NOT NULL,
    "dependency" TEXT[],
    "userId" TEXT NOT NULL,

    CONSTRAINT "Todo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "conversation" TEXT NOT NULL,
    "userId" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Sandbox_userId_key" ON "Sandbox"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_id_key" ON "Conversation"("id");

-- AddForeignKey
ALTER TABLE "Sandbox" ADD CONSTRAINT "Sandbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
