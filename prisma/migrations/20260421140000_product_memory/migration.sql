-- Per-product override of ClientMemory.

-- CreateTable
CREATE TABLE "ProductMemory" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "siteId" TEXT NOT NULL,
    "productHandle" TEXT NOT NULL,
    "brandVoice" TEXT,
    "keyTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "avoidTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,

    CONSTRAINT "ProductMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductMemory_siteId_productHandle_key" ON "ProductMemory"("siteId", "productHandle");
CREATE INDEX "ProductMemory_siteId_idx" ON "ProductMemory"("siteId");
