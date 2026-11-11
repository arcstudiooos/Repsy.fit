// Register / login input rules (Prompt 43), shared by the server and the client.
// The client re-exports this file from client/src/authSchemas.ts, so both sides validate with
// the exact same rules. Only depends on zod - keep it free of server-only imports.
import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 10;
/** bcrypt only uses the first 72 bytes of a password; longer ones are refused, not cut. */
export const PASSWORD_MAX_BYTES = 72;

const email = z
  .string({ required_error: "Please enter your email." })
  .trim()
  .min(1, "Please enter your email.")
  .max(254, "That email is too long.")
  .email("Please enter a valid email address.")
  .transform((e) => e.toLowerCase());

export const RegisterSchema = z.object({
  name: z
    .string({ required_error: "Please enter your name." })
    .trim()
    .min(1, "Please enter your name.")
    .max(100, "Please use a name under 100 characters."),
  email,
  password: z
    .string({ required_error: "Please choose a password." })
    .min(PASSWORD_MIN_LENGTH, `Your password needs at least ${PASSWORD_MIN_LENGTH} characters.`)
    .refine((p) => new TextEncoder().encode(p).length <= PASSWORD_MAX_BYTES, "That password is too long. Please use a shorter one (72 bytes at most; emoji and accents count double)."),
});

export const LoginSchema = z.object({
  email,
  password: z.string({ required_error: "Please enter your password." }).min(1, "Please enter your password."),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
