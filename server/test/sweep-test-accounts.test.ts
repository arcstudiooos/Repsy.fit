// The throwaway-account pattern used by scripts/sweep-test-accounts.mjs.
//
// That script deletes coaches from PRODUCTION, and the email pattern is the only thing that selects
// a target. So the pattern is what gets tested: if it ever matched a real address, the script would
// delete a paying customer's account and every client, plan and check-in under it.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Read the regex out of the script itself, so this cannot drift from what actually runs. */
function patternFromScript(): RegExp {
  const source = readFileSync(path.join(__dirname, "..", "scripts", "sweep-test-accounts.mjs"), "utf8");
  const match = /^const THROWAWAY = (\/.*\/[a-z]*);$/m.exec(source);
  if (!match) throw new Error("THROWAWAY pattern not found in sweep-test-accounts.mjs");
  // eslint-disable-next-line no-eval -- reading our own source, in a test, to avoid a second copy.
  return eval(match[1]) as RegExp;
}

const THROWAWAY = patternFromScript();

describe("the throwaway-account pattern", () => {
  it("matches every address the live-check scripts actually register", () => {
    // These are the real shapes from prompts/*.py - tag plus a timestamp or hex suffix.
    const real = [
      "delivered+cat3f9a1b2c3d@resend.dev",
      "delivered+inspo20261116@resend.dev",
      "delivered+coach20261116104500@resend.dev",
      "delivered+client20261116@resend.dev",
      "delivered+bill9f2a1b@resend.dev",
      "delivered+aicheck20261116@resend.dev",
      "delivered+forms20261116@resend.dev",
      "delivered+probe20261116@resend.dev",
      "delivered+shot1a2b3c@resend.dev",
    ];
    for (const email of real) expect(THROWAWAY.test(email), email).toBe(true);
  });

  it("is case-insensitive, because an address can arrive capitalised", () => {
    expect(THROWAWAY.test("Delivered+Cat3F9A@Resend.dev")).toBe(true);
  });

  it("never matches a real coach's address", () => {
    const real = [
      "ranesh@repsy.fit",
      "coach@gmail.com",
      "ranesh+repsy@gmail.com",
      "hello@resend.dev", // right domain, no throwaway prefix
      "delivered@resend.dev", // the prefix needs its plus-tag
      "delivered+@resend.dev", // and the tag cannot be empty
      "delivered+cat@resend.dev.attacker.com", // domain must END there
      "notdelivered+cat@resend.dev", // must START there
      "a.delivered+cat@resend.dev",
      "delivered+cat@gmail.com",
      "delivered+1cat@resend.dev", // tag starts with a letter in every script
    ];
    for (const email of real) expect(THROWAWAY.test(email), email).toBe(false);
  });

  it("cannot be tricked by a second address smuggled into the local part", () => {
    const sneaky = [
      "delivered+cat@resend.dev,ranesh@repsy.fit",
      "delivered+cat@resend.dev ranesh@repsy.fit",
      "delivered+cat@resend.dev\nranesh@repsy.fit",
      '"delivered+cat@resend.dev"@repsy.fit',
      "delivered+ranesh@repsy.fit@resend.dev",
    ];
    for (const email of sneaky) expect(THROWAWAY.test(email), email).toBe(false);
  });

  it("is anchored at both ends", () => {
    // The script pre-filters in SQL with a substring `contains`, which is far too loose to delete
    // on; the anchors are what make the second check in JS meaningful.
    const source = THROWAWAY.source;
    expect(source.startsWith("^")).toBe(true);
    expect(source.endsWith("$")).toBe(true);
  });
});
