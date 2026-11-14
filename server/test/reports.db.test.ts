// Prompt 70 against a real database (CI only): CSV exports and the progress report are coach-scoped.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";

import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { asCoach } from "./helpers/authedRequest.js";

const tag = `reports-${Date.now()}`;

describe.skipIf(!process.env.DATABASE_URL)("reports and CSV export (database)", () => {
  const coachIds: string[] = [];
  let coach: ReturnType<typeof asCoach>;
  let otherCoach: ReturnType<typeof asCoach>;
  let maya = "";

  beforeAll(async () => {
    for (const n of ["a", "b"]) {
      coachIds.push((await prisma.coach.create({ data: { planTier: "Pro100", name: "Coach", email: `${tag}-${n}@example.com`, passwordHash: "x" } })).id);
    }
    coach = asCoach(app, coachIds[0]);
    otherCoach = asCoach(app, coachIds[1]);
    maya = (await coach.post("/api/clients").send({ name: "Report Probe Maya", notes: "PRIVATE COACH NOTE" })).body.id;
    await coach.post(`/api/clients/${maya}/progress`).send({ date: "2026-10-05", weightKg: 70, adherence: 80, workoutsDone: 3, note: "=cmd" });
    await coach.post(`/api/clients/${maya}/progress`).send({ date: "2026-11-05", weightKg: 69, adherence: 85, workoutsDone: 4 });
    await coach.post(`/api/clients/${maya}/measurements`).send({ date: "2026-10-06", waistCm: 80 });
    await coach.post(`/api/clients/${maya}/assignments`).send({ type: "Workout", title: "Legs", details: "Squat", date: "2026-10-07", status: "Done" });
    await coach.put(`/api/clients/${maya}/plan`).send({ planName: "Monthly", priceAmount: 4999, billingCycle: "Monthly", startDate: "2026-10-01" });
    await coach.post(`/api/clients/${maya}/plan/payments`).send({ amount: 4999, paidOn: "2026-10-01", method: "UPI" });
  });

  afterAll(async () => {
    await prisma.coach.deleteMany({ where: { id: { in: coachIds } } }); // cascades everything made above
    await prisma.$disconnect();
  });

  it("exports each type as CSV with the right headers and YYYY-MM-DD dates, range applied", async () => {
    const progress = await coach.get(`/api/reports/clients/${maya}/export/progress?from=2026-10-01&to=2026-10-31`);
    expect(progress.status).toBe(200);
    expect(progress.text).toBe("﻿date,weightKg,adherence,workoutsDone,note\r\n2026-10-05,70,80,3,'=cmd\r\n");
    const all = await coach.get(`/api/reports/clients/${maya}/export/progress`);
    expect(all.text.trim().split("\r\n")).toHaveLength(3);
    expect((await coach.get(`/api/reports/clients/${maya}/export/measurements`)).text).toContain("\r\n2026-10-06,80,,,,,\r\n"); // date, waistCm=80, then empty chest/arm/hip/bodyFat/note
    expect((await coach.get(`/api/reports/clients/${maya}/export/payments`)).text).toBe("﻿paidOn,amount,method,note\r\n2026-10-01,4999,UPI,\r\n");
    expect((await coach.get(`/api/reports/clients/${maya}/export/assignments`)).text).toContain("2026-10-07,Workout,Legs,Squat,,manual,Done");
  });

  it("roster lists the client with plan status and next due date", async () => {
    const res = await coach.get("/api/reports/roster");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Report Probe Maya,General fitness,Beginner,Monthly,Active,Monthly,4999,2026-11-01");
  });

  it("the progress report has no coach notes", async () => {
    const res = await coach.get(`/api/reports/clients/${maya}/progress-report`);
    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(2);
    expect(res.body.assignments).toMatchObject({ total: 1, done: 1 });
    expect(JSON.stringify(res.body)).not.toContain("PRIVATE COACH NOTE");
  });

  it("another coach gets 404 for the client's exports and an empty roster", async () => {
    for (const path of [`export/progress`, `export/payments`, `progress-report`]) {
      expect((await otherCoach.get(`/api/reports/clients/${maya}/${path}`)).status).toBe(404);
    }
    expect((await otherCoach.get("/api/reports/roster")).text).not.toContain("Report Probe Maya");
  });
});
