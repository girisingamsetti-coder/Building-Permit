import { z } from 'zod';
import { ROLES } from '@/lib/constants';

const roleKeys = Object.values(ROLES) as [string, ...string[]];

const email = z
  .string()
  .min(1, 'Enter an email address')
  .email('That does not look like an email address')
  .max(200)
  .transform((v) => v.trim().toLowerCase());

const name = z.string().min(2, 'Enter a full name').max(150).transform((v) => v.trim());

/** Ten digits, optionally with +91. Blank is allowed — not every user has one on file. */
const phone = z
  .string()
  .trim()
  .refine((v) => v === '' || /^(\+91[- ]?)?[6-9]\d{9}$/.test(v), 'Enter a valid 10-digit mobile number')
  .optional()
  .default('');

const optionalString = z.string().trim().max(200).optional().default('');

export const createUserSchema = z.object({
  email,
  name,
  phone,
  designation: optionalString,
  employeeCode: optionalString,
  roleKey: z.enum(roleKeys, { errorMap: () => ({ message: 'Choose a role' }) }),
  departmentId: z.string().uuid().nullable().optional(),
  officeId: z.string().uuid().nullable().optional(),
  primaryZoneId: z.string().uuid().nullable().optional(),
  zoneIds: z.array(z.string().uuid()).default([]),

  // LTP registration details
  ltpLicenceNo: optionalString,
  ltpLicenceClass: optionalString,
  ltpValidUpto: z.string().datetime().nullable().optional(),
  firmName: optionalString,

  /**
   * Optional. When omitted a random password is generated and the account is
   * flagged to change it at first sign-in — safer than a shared default, and
   * it means an administrator never has to invent one.
   */
  password: z.string().min(10, 'Use at least 10 characters').max(200).optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema
  .omit({ password: true, email: true })
  .partial()
  .extend({
    // Email changes are allowed but validated the same way.
    email: email.optional(),
  });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const setUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
  reason: z.string().trim().max(500).optional().default(''),
});
export type SetUserStatusInput = z.infer<typeof setUserStatusSchema>;

export const assignRoleSchema = z.object({
  roleKey: z.enum(roleKeys, { errorMap: () => ({ message: 'Choose a role' }) }),
});
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;

export const userListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'LOCKED', 'SUSPENDED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;
