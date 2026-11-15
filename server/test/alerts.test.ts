// Owner alerting (Nov 2026).
//
// The feature's real risk is not missing an alert: it is sending two thousand. A crash loop that
// emails on every request makes the inbox unreadable exactly when it matters, so the throttling is
// what these tests mostly protect.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mayAlert, resetAlerts, signatureOf } from "../src/ops/alerts.js";

beforeEach(() => {
  resetAlerts();
  vi.restoreAllMocks();
});

describe("signatureOf: what makes two problems the SAME problem", () => {
  it("ignores ids, numbers and dates", () => {
    const a = signatureOf("GET /api/clients/ckl9x8m2a0001/snapshot answered 500 on 2026-11-15");
    const b = signatureOf("GET /api/clients/ckzz11pp0009/snapshot answered 500 on 2026-11-16");
    expect(a).toBe(b);
  });

  it("still tells different problems apart", () => {
    expect(signatureOf("GET /api/forms answered 500")).not.toBe(signatureOf("POST /api/meals answered 500"));
  });

  it("does not grow without bound", () => {
    expect(signatureOf("x".repeat(5000)).length).toBeLessThanOrEqual(200);
  });
});

describe("mayAlert", () => {
  const t = (iso: string) => new Date(iso);

  it("lets a new problem through at once", () => {
    expect(mayAlert("a problem", t("2026-11-15T10:00:00Z"))).toBe(true);
  });

  it("holds back the SAME problem for an hour, so a loop cannot flood the inbox", () => {
    expect(mayAlert("same", t("2026-11-15T10:00:00Z"))).toBe(true);
    expect(mayAlert("same", t("2026-11-15T10:00:01Z"))).toBe(false);
    expect(mayAlert("same", t("2026-11-15T10:59:00Z"))).toBe(false);
    // An hour later it is news again: the problem evidently did not go away.
    expect(mayAlert("same", t("2026-11-15T11:00:01Z"))).toBe(true);
  });

  it("lets a DIFFERENT problem through inside that hour", () => {
    expect(mayAlert("first", t("2026-11-15T10:00:00Z"))).toBe(true);
    expect(mayAlert("second", t("2026-11-15T10:00:01Z"))).toBe(true);
  });

  it("stops at the daily ceiling, however many distinct problems there are", () => {
    const day = t("2026-11-15T10:00:00Z");
    let sent = 0;
    for (let i = 0; i < 100; i++) if (mayAlert(`problem ${i}`, day)) sent += 1;
    expect(sent).toBe(20);
  });

  it("starts fresh the next day", () => {
    const day = t("2026-11-15T10:00:00Z");
    for (let i = 0; i < 100; i++) mayAlert(`problem ${i}`, day);
    expect(mayAlert("a new day", t("2026-11-16T09:00:00Z"))).toBe(true);
  });
});
