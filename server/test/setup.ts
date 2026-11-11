// Runs before every server test file (Prompt 47). Most mocked tests sign in with a cookie for a coach
// that only exists inside their own prisma mock, so the per-request "is this session still current?"
// database lookup is answered "yes" here. Tests of that lookup itself (password-reset*.test.ts) call
// vi.unmock("../src/auth/sessionCheck.js") to use the real one.
import { vi } from "vitest";

vi.mock("../src/auth/sessionCheck.js", () => ({ isSessionCurrent: async () => true }));
