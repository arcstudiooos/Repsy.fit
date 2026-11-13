// Shared validation helpers (zod 4, Nov 2026).
//
// zod 4 dropped `.strict("message")`: `.strict()` now takes no arguments and unknown keys get
// zod's own wording ('Unrecognized key: "x"'). Our messages tell the caller WHICH fields a route
// accepts, which is worth keeping, so this rebuilds the object with an object-level error handler
// that answers the unrecognized-keys issue only - every other message still comes from the field
// that produced it.
import { z } from "zod";

export function strictWith<T extends z.ZodRawShape>(schema: z.ZodObject<T>, message: string) {
  return z.object(schema.shape, {
    error: (issue) => (issue.code === "unrecognized_keys" ? message : undefined),
  }).strict();
}
