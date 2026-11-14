// cancelSubscription is idempotent (Nov 2026).
//
// The real incident this came from: the owner cancelled, PayPal cancelled the subscription, and the
// app still answered "PayPal could not cancel the plan". A coach who sees that clicks again, or
// believes they are still being charged. Whatever the cancel call returns, the answer must match
// what PayPal actually holds.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// The token request reads .json(); every other call reads .text().
const ok = (body: unknown, status = 200) =>
  Promise.resolve({
    ok: status < 400,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  });
const noBody = (status: number) =>
  Promise.resolve({ ok: status < 400, status, text: () => Promise.resolve(""), json: () => Promise.resolve({}) });

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  process.env.PAYPAL_ENV = "sandbox";
  process.env.PAYPAL_CLIENT_ID = "id";
  process.env.PAYPAL_CLIENT_SECRET = "secret";
});
afterEach(() => vi.unstubAllEnvs());

/** Every call needs a token first. */
const withToken = () => fetchMock.mockImplementationOnce(() => ok({ access_token: "t", expires_in: 3600 }));

describe("cancelSubscription", () => {
  it("is happy with PayPal's empty 204", async () => {
    const { cancelSubscription } = await import("../src/billing/paypal.js");
    withToken().mockImplementationOnce(() => noBody(204));
    expect(await cancelSubscription("I-1", "testing")).toBe(true);
  });

  it("says yes when the cancel failed but PayPal already has it cancelled", async () => {
    const { cancelSubscription } = await import("../src/billing/paypal.js");
    withToken()
      .mockImplementationOnce(() => Promise.reject(new Error("socket hang up")))
      .mockImplementationOnce(() => ok({ id: "I-1", status: "CANCELLED", plan_id: "P-1" }));
    expect(await cancelSubscription("I-1", "testing")).toBe(true);
  });

  it("says yes for an expired subscription too", async () => {
    const { cancelSubscription } = await import("../src/billing/paypal.js");
    withToken()
      .mockImplementationOnce(() => ok({ name: "UNPROCESSABLE_ENTITY" }, 422))
      .mockImplementationOnce(() => ok({ id: "I-1", status: "EXPIRED", plan_id: "P-1" }));
    expect(await cancelSubscription("I-1", "testing")).toBe(true);
  });

  it("says no when the subscription is genuinely still active", async () => {
    const { cancelSubscription } = await import("../src/billing/paypal.js");
    withToken()
      .mockImplementationOnce(() => ok({ name: "RESOURCE_NOT_FOUND" }, 404))
      .mockImplementationOnce(() => ok({ id: "I-1", status: "ACTIVE", plan_id: "P-1" }));
    expect(await cancelSubscription("I-1", "testing")).toBe(false);
  });

  it("says no when PayPal cannot be reached at all", async () => {
    const { cancelSubscription } = await import("../src/billing/paypal.js");
    withToken()
      .mockImplementationOnce(() => Promise.reject(new Error("down")))
      .mockImplementationOnce(() => Promise.reject(new Error("down")));
    expect(await cancelSubscription("I-1", "testing")).toBe(false);
  });
});
