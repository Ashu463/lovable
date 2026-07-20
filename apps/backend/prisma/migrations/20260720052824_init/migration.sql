-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('IN_PROGRESS', 'CLARIFICATION_NEEDED', 'COMPLETED', 'FAILED', 'STOPPED');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('coder', 'debuggerr', 'tester', 'researcher', 'uiExpert');

-- CreateEnum
CREATE TYPE "TodoStatus" AS ENUM ('PENDING', 'COMPLETED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT,
    "googleId" TEXT,
    "semanticMem" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "repoTree" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sandboxId" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "userPrompt" TEXT NOT NULL,
    "currentStep" TEXT,
    "contextSnapshot" TEXT,
    "sessionSnapshot" TEXT,
    "parentRunId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Todo" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "taskId" INTEGER NOT NULL,
    "task" TEXT NOT NULL,
    "agent" "AgentType" NOT NULL,
    "status" "TodoStatus" NOT NULL DEFAULT 'PENDING',
    "dependency" INTEGER[],
    "agentSpecificData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Todo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskSummary" (
    "id" TEXT NOT NULL,
    "todoId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Design" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "htmlContent" TEXT,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Design_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answers" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "answer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "Answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "agent" "AgentType",
    "content" TEXT,
    "toolType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "session" JSONB[],
    "context" JSONB[],
    "iteration" INTEGER NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE INDEX "Run_projectId_idx" ON "Run"("projectId");

-- CreateIndex
CREATE INDEX "Todo_runId_idx" ON "Todo"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "Todo_runId_taskId_key" ON "Todo"("runId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskSummary_todoId_key" ON "TaskSummary"("todoId");

-- CreateIndex
CREATE INDEX "Design_projectId_idx" ON "Design"("projectId");

-- CreateIndex
CREATE INDEX "Design_projectId_isSelected_idx" ON "Design"("projectId", "isSelected");

-- CreateIndex
CREATE UNIQUE INDEX "Answers_questionId_key" ON "Answers"("questionId");

-- CreateIndex
CREATE INDEX "Answers_runId_idx" ON "Answers"("runId");

-- CreateIndex
CREATE INDEX "RunEvent_runId_createdAt_idx" ON "RunEvent"("runId", "createdAt");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "Run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSummary" ADD CONSTRAINT "TaskSummary_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "Todo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Design" ADD CONSTRAINT "Design_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answers" ADD CONSTRAINT "Answers_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answers" ADD CONSTRAINT "Answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunEvent" ADD CONSTRAINT "RunEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
