// Shared test helper (Prompt 45): supertest calls that carry a valid session cookie, because every
// /api/clients and /api/seed route now needs a signed-in coach. Use the default export in place of
// `request` from "supertest" for signed-in calls; use plain supertest for signed-out calls.
import request from "supertest";
import type { Express } from "express";
import { SESSION_COOKIE, signSession } from "../../src/auth/session.js";

/** The coach id the default export signs in as (mocked tests expect this as coachId). */
export const TEST_COACH_ID = "coach-1";

/** A `Cookie` header value that signs in as this coach. */
export const cookieFor = (coachId: string) => `${SESSION_COOKIE}=${signSession(coachId)}`;

/** supertest for `app`, signed in as `coachId`. */
export function asCoach(app: Express, coachId: string) {
  const cookie = cookieFor(coachId);
  return {
    get: (url: string) => request(app).get(url).set("Cookie", cookie),
    post: (url: string) => request(app).post(url).set("Cookie", cookie),
    patch: (url: string) => request(app).patch(url).set("Cookie", cookie),
    put: (url: string) => request(app).put(url).set("Cookie", cookie),
    delete: (url: string) => request(app).delete(url).set("Cookie", cookie),
  };
}

/** Drop-in for `request(app)`, signed in as TEST_COACH_ID. */
export default function signedInRequest(app: Express) {
  return asCoach(app, TEST_COACH_ID);
}
