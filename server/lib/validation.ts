import { ZodError, z } from "zod";

export const registerCredentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,24}$/, {
      message:
        "Usernames must be 3-24 characters using lowercase letters, numbers, or underscores.",
    }),
  displayName: z
    .string()
    .trim()
    .min(1, { message: "Display names must be between 1 and 48 characters." })
    .max(48, { message: "Display names must be between 1 and 48 characters." }),
  password: z
    .string()
    .min(8, { message: "Passwords must be between 8 and 128 characters." })
    .max(128, { message: "Passwords must be between 8 and 128 characters." }),
});

export const loginCredentialsSchema = z.object({
  username: z.string().default(""),
  password: z.string().default(""),
});

export function createHttpError(
  message: string,
  statusCode: number,
): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

export function parseOrThrow<T>(
  schema: z.ZodType<T>,
  value: unknown,
  fallbackMessage = "The request body is invalid.",
): T {
  const result = schema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  throw createHttpError(readableZodMessage(result.error, fallbackMessage), 400);
}

export function readableZodMessage(error: ZodError, fallbackMessage: string): string {
  return error.issues[0]?.message ?? fallbackMessage;
}
