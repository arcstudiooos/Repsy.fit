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

const name = z
  .string({ required_error: "Please enter your name." })
  .trim()
  .min(1, "Please enter your name.")
  .max(100, "Please use a name under 100 characters.");

const newPassword = z
  .string({ required_error: "Please choose a password." })
  .min(PASSWORD_MIN_LENGTH, `Your password needs at least ${PASSWORD_MIN_LENGTH} characters.`)
  .refine((p) => new TextEncoder().encode(p).length <= PASSWORD_MAX_BYTES, "That password is too long. Please use a shorter one (72 bytes at most; emoji and accents count double).");

export const RegisterSchema = z.object({ name, email, password: newPassword });

export const LoginSchema = z.object({
  email,
  password: z.string({ required_error: "Please enter your password." }).min(1, "Please enter your password."),
});

// Password reset and account settings (Prompt 47).
export const ForgotSchema = z.object({ email });
export const ResetSchema = z.object({
  token: z.string({ required_error: "This reset link is not valid any more. Please ask for a new one." }).min(1, "This reset link is not valid any more. Please ask for a new one.").max(200),
  password: newPassword,
});
export const UpdateNameSchema = z.object({ name });
/** Prompt 68: the coach's single currency for plan prices and payments. */
export const COACH_CURRENCIES = ["INR", "USD"] as const;
export const UpdateCurrencySchema = z.object({
  currency: z.enum(COACH_CURRENCIES, { errorMap: () => ({ message: "Please choose INR or USD." }) }),
});
export const ChangePasswordSchema = z.object({
  currentPassword: z.string({ required_error: "Please enter your current password." }).min(1, "Please enter your current password."),
  newPassword,
});

// Client invite and client sign-in (Prompt 65). Same email and password rules as coaches.
export const BAD_INVITE = "This invite link is not valid any more. Please ask your coach for a new one.";
export const InviteSchema = z.object({ email });
export const ClientSetPasswordSchema = z.object({
  token: z.string({ required_error: BAD_INVITE }).min(1, BAD_INVITE).max(200),
  password: newPassword,
});
export const ClientLoginSchema = LoginSchema;

// Joining with a coach's code (Prompt 77): same name, email and password rules as coach sign-up.
export const ClientJoinSchema = z.object({
  code: z.string({ required_error: "This join code is not valid. Please ask your coach for a new one." }).max(40),
  name,
  email,
  password: newPassword,
});
export const ClientForgotSchema = ForgotSchema;
export const ClientResetSchema = ResetSchema;

/** Prompt 77: the welcome questions. The same goal/level/number ranges as the coach's client form. */
export const CLIENT_LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;
export const CLIENT_UNITS = ["kg", "lb"] as const;
export const ClientProfileSchema = z
  .object({
    goal: z.string().trim().min(1, "Goal can't be empty.").max(100, "Please keep the goal under 100 characters.").optional(),
    age: z.number({ invalid_type_error: "Age must be a whole number." }).int("Age must be a whole number.").min(13, "You need to be at least 13.").max(120, "Please enter a real age.").nullable().optional(),
    heightCm: z.number({ invalid_type_error: "Height must be a number." }).min(50, "Height looks too small.").max(300, "Height looks too big.").nullable().optional(),
    weightKg: z.number({ invalid_type_error: "Weight must be a number." }).min(20, "Weight looks too small.").max(500, "Weight looks too big.").nullable().optional(),
    level: z.enum(CLIENT_LEVELS, { errorMap: () => ({ message: "Please pick Beginner, Intermediate or Advanced." }) }).optional(),
    injuries: z.string().trim().max(1000, "Please keep this under 1000 characters.").optional(),
    units: z.enum(CLIENT_UNITS, { errorMap: () => ({ message: "Please pick kg or lb." }) }).optional(),
    /** True for "Skip for now": nothing else is saved, the welcome step just stops showing. */
    skip: z.boolean().optional(),
  })
  .strict("Only the welcome questions can be changed here.");
export type ClientProfileInput = z.infer<typeof ClientProfileSchema>;

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type InviteInput = z.infer<typeof InviteSchema>;
export type ClientSetPasswordInput = z.infer<typeof ClientSetPasswordSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type ForgotInput = z.infer<typeof ForgotSchema>;
export type ResetInput = z.infer<typeof ResetSchema>;
export type UpdateNameInput = z.infer<typeof UpdateNameSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

/**
 * Deleting an account (Prompt 73): the password proves it is really them, and the typed word stops a
 * mis-click. The confirm word is compared exactly, so a lowercase "delete" is refused.
 */
export const DeleteAccountSchema = z.object({
  password: z.string({ required_error: "Please enter your password." }).min(1, "Please enter your password."),
  confirm: z.literal("DELETE", {
    errorMap: () => ({ message: "To delete your account, type DELETE and enter your password." }),
  }),
});
