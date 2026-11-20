-- CreateTable
CREATE TABLE "ShopSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultCountryCode" TEXT NOT NULL DEFAULT '92',
    "templateName" TEXT NOT NULL DEFAULT 'cod_order_confirmation',
    "templateLanguage" TEXT NOT NULL DEFAULT 'en',
    "waPhoneNumberId" TEXT,
    "waAccessToken" TEXT,
    "reminderAfterHours" INTEGER NOT NULL DEFAULT 6,
    "expireAfterHours" INTEGER NOT NULL DEFAULT 24,
    "autoCancel" BOOLEAN NOT NULL DEFAULT false,
    "highRiskThreshold" INTEGER NOT NULL DEFAULT 60,
    "highValueAmount" REAL NOT NULL DEFAULT 10000,
    "tagPending" TEXT NOT NULL DEFAULT 'cod-pending',
    "tagConfirmed" TEXT NOT NULL DEFAULT 'cod-confirmed',
    "tagCancelled" TEXT NOT NULL DEFAULT 'cod-cancelled',
    "tagNoResponse" TEXT NOT NULL DEFAULT 'cod-no-response',
    "tagHighRisk" TEXT NOT NULL DEFAULT 'cod-high-risk',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OrderVerification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "customerName" TEXT,
    "phone" TEXT,
    "totalPrice" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "riskReasons" TEXT NOT NULL DEFAULT '[]',
    "messageId" TEXT,
    "error" TEXT,
    "reminderSent" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" DATETIME,
    "respondedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderVerification_shop_orderId_key" ON "OrderVerification"("shop", "orderId");
CREATE INDEX "OrderVerification_shop_createdAt_idx" ON "OrderVerification"("shop", "createdAt");
CREATE INDEX "OrderVerification_shop_phone_idx" ON "OrderVerification"("shop", "phone");
CREATE INDEX "OrderVerification_status_sentAt_idx" ON "OrderVerification"("status", "sentAt");
