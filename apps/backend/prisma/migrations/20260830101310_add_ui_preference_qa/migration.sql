-- CreateTable
CREATE TABLE "UIPreferenceQuestion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UIPreferenceQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UIPreferenceAnswer" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "UIPreferenceAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UIPreferenceAnswer_questionId_key" ON "UIPreferenceAnswer"("questionId");

-- CreateIndex
CREATE INDEX "UIPreferenceAnswer_projectId_idx" ON "UIPreferenceAnswer"("projectId");

-- AddForeignKey
ALTER TABLE "UIPreferenceQuestion" ADD CONSTRAINT "UIPreferenceQuestion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UIPreferenceAnswer" ADD CONSTRAINT "UIPreferenceAnswer_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UIPreferenceAnswer" ADD CONSTRAINT "UIPreferenceAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "UIPreferenceQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
