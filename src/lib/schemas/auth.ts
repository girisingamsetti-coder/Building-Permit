import { z } from 'zod';

/**
 * One schema per form, imported by BOTH the React Hook Form resolver and the
 * API route. A field the server rejects cannot be a field the client accepted,
 * because they are literally the same object.
 */

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Enter your email address')
    .email('That does not look like an email address')
    .transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, 'Enter your email address')
    .email('That does not look like an email address')
    .transform((v) => v.trim().toLowerCase()),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/** Shared by reset and change, so the rules cannot drift apart. */
const password = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(200, 'That password is too long')
  .refine((v) => /[a-zA-Z]/.test(v), 'Include at least one letter')
  .refine((v) => /[0-9]/.test(v), 'Include at least one number');

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'This reset link is not valid'),
    password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'The two passwords do not match',
    path: ['confirmPassword'],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'The two passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((v) => v.password !== v.currentPassword, {
    message: 'The new password must be different from the current one',
    path: ['password'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
