-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopSettings" (
    "shop" TEXT NOT NULL,
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
    "highValueAmount" DOUBLE PRECISION NOT NULL DEFAULT 10000,
    "tagPending" TEXT NOT NULL DEFAULT 'cod-pending',
    "tagConfirmed" TEXT NOT NULL DEFAULT 'cod-confirmed',
    "tagCancelled" TEXT NOT NULL DEFAULT 'cod-cancelled',
    "tagNoResponse" TEXT NOT NULL DEFAULT 'cod-no-response',
    "tagHighRisk" TEXT NOT NULL DEFAULT 'cod-high-risk',
    "courierProvider" TEXT NOT NULL DEFAULT 'none',
    "leopardsApiKey" TEXT,
    "leopardsApiPassword" TEXT,
    "leopardsTestMode" BOOLEAN NOT NULL DEFAULT true,
    "postexToken" TEXT,
    "postexPickupAddressCode" TEXT,
    "defaultWeightGrams" INTEGER NOT NULL DEFAULT 500,
    "specialInstructions" TEXT NOT NULL DEFAULT '',
    "autoBookOnConfirm" BOOLEAN NOT NULL DEFAULT false,
    "fulfillOnBooking" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "OrderVerification" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "customerName" TEXT,
    "phone" TEXT,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "riskReasons" TEXT NOT NULL DEFAULT '[]',
    "messageId" TEXT,
    "error" TEXT,
    "reminderSent" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "phone" TEXT,
    "provider" TEXT NOT NULL,
    "trackingNumber" TEXT,
    "labelUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'BOOKING',
    "rawStatus" TEXT,
    "codAmount" DOUBLE PRECISION NOT NULL,
    "city" TEXT,
    "error" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderVerification_shop_createdAt_idx" ON "OrderVerification"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "OrderVerification_shop_phone_idx" ON "OrderVerification"("shop", "phone");

-- CreateIndex
CREATE INDEX "OrderVerification_status_sentAt_idx" ON "OrderVerification"("status", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderVerification_shop_orderId_key" ON "OrderVerification"("shop", "orderId");

-- CreateIndex
CREATE INDEX "Shipment_shop_createdAt_idx" ON "Shipment"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "Shipment_shop_phone_idx" ON "Shipment"("shop", "phone");

-- CreateIndex
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_shop_orderId_key" ON "Shipment"("shop", "orderId");

