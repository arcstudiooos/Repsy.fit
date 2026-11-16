#!/usr/bin/env node
/**
 * Delete leftover throwaway coach accounts from production.
 *
 * Why this exists: the live-check scripts in prompts/ register a real coach against production,
 * exercise it, then delete it in a `finally`. If one of them crashes hard enough (or the network
 * drops at the wrong moment) the account survives with a random password that only ever existed in
 * memory - so nobody, including the account's own owner, can ever sign in or delete it through the
 * API. Three of those accumulated before this script existed.
 *
 * What makes this safe to point at production:
 *
 *   Every throwaway signs up as `delivered+<tag><suffix>@resend.dev`. That is Resend's sandbox
 *   inbox - mail to it is accepted and discarded, so no human can receive a password reset there,
 *   and a real coach could never have signed up with it and still have a working account. The
 *   pattern is the whole discriminator, which is why this script will not take a coach id, an
 *   email, or anything else as a target. It CANNOT be aimed at a real account.
 *
 * Deliberately NOT a discriminator: "has no clients". The live checks create clients, habits and
 * assignments on purpose, so a leftover test coach usually DOES own data. Refusing to delete those
 * would leave exactly the accounts this is meant to remove.
 *
 * Deletion is one `coach.delete`, the same call DELETE /api/auth/account makes, so the 42 cascades
 * in schema.prisma do the work. No table list to keep in sync here.
 *
 * Usage (from a Render shell, or anywhere DATABASE_URL points at the right database):
 *
 *   node scripts/sweep-test-accounts.mjs            # lists what it WOULD delete, deletes nothing
 *   node scripts/sweep-test-accounts.mjs --yes      # actually deletes
 *   node scripts/sweep-test-accounts.mjs --yes --max 5
 */
import { PrismaClient } from "@prisma/client";

/**
 * `delivered+` then a tag, at resend.dev. Anchored at both ends, and the local part after the plus
 * is restricted to letters and digits so nothing with an embedded "@" or a second address can
 * squeeze through.
 */
const THROWAWAY = /^delivered\+[a-z][a-z0-9]*@resend\.dev$/i;

/** A cap, so a bad query or a bad day can never turn into a table wipe. */
const DEFAULT_MAX = 25;

const args = process.argv.slice(2);
const confirmed = args.includes("--yes");
const maxArg = args.indexOf("--max");
const max = maxArg === -1 ? DEFAULT_MAX : Number(args[maxArg + 1]);

if (!Number.isInteger(max) || max < 1) {
  console.error("--max must be a positive whole number");
  process.exit(2);
}

const prisma = new PrismaClient();

try {
  // Filtered in SQL as far as it goes, then checked again in JS against the anchored pattern:
  // `contains` is a substring match, which is too loose to delete on by itself.
  const candidates = await prisma.coach.findMany({
    where: { email: { contains: "delivered+", mode: "insensitive" } },
    select: { id: true, email: true, name: true, createdAt: true, _count: { select: { clients: true } } },
    orderBy: { createdAt: "asc" },
  });

  const targets = candidates.filter((c) => THROWAWAY.test(c.email));
  const skipped = candidates.filter((c) => !THROWAWAY.test(c.email));

  for (const c of skipped) {
    console.log(`skip   ${c.email} - contains "delivered+" but is not the sandbox pattern`);
  }

  if (targets.length === 0) {
    console.log("Nothing to sweep: no throwaway accounts found.");
    process.exit(0);
  }

  console.log(`Found ${targets.length} throwaway account(s):`);
  for (const c of targets) {
    console.log(
      `  ${c.email}  name=${JSON.stringify(c.name)}  clients=${c._count.clients}  created=${c.createdAt.toISOString()}`,
    );
  }

  if (targets.length > max) {
    console.error(
      `\nRefusing to continue: ${targets.length} matches is more than --max ${max}. ` +
        `That many is more likely a bad query than a real backlog - check the list above first.`,
    );
    process.exit(1);
  }

  if (!confirmed) {
    console.log("\nDry run. Nothing was deleted. Re-run with --yes to delete these.");
    process.exit(0);
  }

  let deleted = 0;
  for (const c of targets) {
    // One at a time, not a deleteMany: a failure on one account should not hide the ones that did
    // work, and the log needs to name what actually went.
    await prisma.coach.delete({ where: { id: c.id } });
    deleted += 1;
    console.log(`deleted ${c.email}`);
  }
  console.log(`\nSwept ${deleted} throwaway account(s).`);
} finally {
  await prisma.$disconnect();
}
