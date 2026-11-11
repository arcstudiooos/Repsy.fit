// Prompt 43: password hashing and the shared register / login schemas (no database).
import { describe, expect, it } from "vitest";
import { BCRYPT_COST, hashPassword, verifyPassword } from "../src/auth/password.js";
import { LoginSchema, RegisterSchema } from "../src/auth/schemas.js";

describe("password hashing (bcrypt)", () => {
  it("stores a salted bcrypt hash, never the password itself", async () => {
    const password = "correct horse battery";
    const a = await hashPassword(password);
    const b = await hashPassword(password);
    expect(a).not.toContain(password);
    expect(a).toMatch(new RegExp(`^\\$2[aby]\\$${BCRYPT_COST}\\$`));
    expect(a).not.toBe(b); // random salt each time
    expect(await verifyPassword(password, a)).toBe(true);
    expect(await verifyPassword("wrong password!", a)).toBe(false);
  });
});

describe("RegisterSchema", () => {
  const ok = { name: "  Ana Coach ", email: "  Ana@Example.COM ", password: "0123456789" };

  it("accepts a valid sign-up, trims the name and lower-cases the email", () => {
    expect(RegisterSchema.parse(ok)).toEqual({ name: "Ana Coach", email: "ana@example.com", password: "0123456789" });
  });

  it.each([
    [{ ...ok, password: "123456789" }, "Your password needs at least 10 characters."],
    [{ ...ok, email: "not-an-email" }, "Please enter a valid email address."],
    [{ ...ok, name: "   " }, "Please enter your name."],
    [{ ...ok, password: "x".repeat(73) }, "That password is too long. Please use a shorter one (72 bytes at most; emoji and accents count double)."],
    [{ email: ok.email, password: ok.password }, "Please enter your name."],
  ])("rejects bad input in plain words: %j", (input, message) => {
    const r = RegisterSchema.safeParse(input);
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].message).toBe(message);
  });

  it("never echoes the password back in an error", () => {
    const r = RegisterSchema.safeParse({ ...ok, password: "short-pw" });
    expect(JSON.stringify(r.error!.issues)).not.toContain("short-pw");
  });
});

describe("LoginSchema", () => {
  it("lower-cases the email and requires a password", () => {
    expect(LoginSchema.parse({ email: "A@B.co", password: "x" })).toEqual({ email: "a@b.co", password: "x" });
    expect(LoginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});
