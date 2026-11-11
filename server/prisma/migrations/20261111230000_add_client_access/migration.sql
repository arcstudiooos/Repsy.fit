-- Prompt 65: client sign-in. A client gets a login email when invited and a password hash once
-- they set a password from the invite link. Invites are single-use, hashed, 48-hour tokens; the
-- invite carries the email, which becomes the login email only when the password is set.
ALTER TABLE "clients" ADD COLUMN "loginEmail" TEXT;
ALTER TABLE "clients" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "clients" ADD COLUMN "clientSessionVersion" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "clients_loginEmail_key" ON "clients"("loginEmail");

CREATE TABLE "client_invites" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_invites_tokenHash_key" ON "client_invites"("tokenHash");
CREATE INDEX "client_invites_clientId_idx" ON "client_invites"("clientId");
CREATE INDEX "client_invites_coachId_idx" ON "client_invites"("coachId");

ALTER TABLE "client_invites" ADD CONSTRAINT "client_invites_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_invites" ADD CONSTRAINT "client_invites_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
