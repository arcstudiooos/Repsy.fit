-- Prompt 77: clients join with a coach's code; welcome questions; client password reset.
ALTER TABLE "clients" ADD COLUMN "joinStatus" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "clients" ADD COLUMN "joinedVia" TEXT NOT NULL DEFAULT 'coach';
ALTER TABLE "clients" ADD COLUMN "units" TEXT NOT NULL DEFAULT 'kg';
ALTER TABLE "clients" ADD COLUMN "onboardedAt" TIMESTAMP(3);

CREATE TABLE "client_password_reset_tokens" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "client_password_reset_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "client_password_reset_tokens_tokenHash_key" ON "client_password_reset_tokens"("tokenHash");
CREATE INDEX "client_password_reset_tokens_clientId_idx" ON "client_password_reset_tokens"("clientId");
ALTER TABLE "client_password_reset_tokens" ADD CONSTRAINT "client_password_reset_tokens_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
