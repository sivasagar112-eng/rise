import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const dismissalTypesEnum = z.enum([
  'PUSHUP_MATH',
  'BRIGHTNESS',
  'FACE_AWAY',
  'OBJECT_MATCH',
  'MATH',
]);

export const alarmSchema = z.object({
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in HH:mm 24-hr format'),
  label: z.string().max(50).default('Alarm'),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
  dismissalType: dismissalTypesEnum.default('PUSHUP_MATH'),
  pushupTarget: z.number().int().min(1).max(50).default(5),
  referenceDescriptor: z.string().nullable().optional(),
  rampDuration: z.number().int().min(5).max(120).default(30),
  preAlarmEnabled: z.boolean().default(false),
  isEnabled: z.boolean().default(true),
});

export const updateAlarmSchema = alarmSchema.partial();

export const dismissLogSchema = z.object({
  alarmId: z.string().optional().nullable(),
  scheduledTime: z.string(),
  responseTimeSeconds: z.number().int().nonnegative(),
  dismissalType: dismissalTypesEnum,
  success: z.boolean().default(true),
});
