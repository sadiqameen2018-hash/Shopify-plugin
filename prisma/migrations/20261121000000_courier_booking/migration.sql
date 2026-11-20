-- AlterTable
ALTER TABLE "ShopSettings" ADD COLUMN "courierProvider" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "ShopSettings" ADD COLUMN "leopardsApiKey" TEXT;
ALTER TABLE "ShopSettings" ADD COLUMN "leopardsApiPassword" TEXT;
ALTER TABLE "ShopSettings" ADD COLUMN "leopardsTestMode" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ShopSettings" ADD COLUMN "postexToken" TEXT;
ALTER TABLE "ShopSettings" ADD COLUMN "postexPickupAddressCode" TEXT;
ALTER TABLE "ShopSettings" ADD COLUMN "defaultWeightGrams" INTEGER NOT NULL DEFAULT 500;
ALTER TABLE "ShopSettings" ADD COLUMN "specialInstructions" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ShopSettings" ADD COLUMN "autoBookOnConfirm" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShopSettings" ADD COLUMN "fulfillOnBooking" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "phone" TEXT,
    "provider" TEXT NOT NULL,
    "trackingNumber" TEXT,
    "labelUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'BOOKING',
    "rawStatus" TEXT,
    "codAmount" REAL NOT NULL,
    "city" TEXT,
    "error" TEXT,
    "lastCheckedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_shop_orderId_key" ON "Shipment"("shop", "orderId");
CREATE INDEX "Shipment_shop_createdAt_idx" ON "Shipment"("shop", "createdAt");
CREATE INDEX "Shipment_shop_phone_idx" ON "Shipment"("shop", "phone");
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");
