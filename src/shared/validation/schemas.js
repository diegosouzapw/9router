import { z } from "zod";

// ──── Provider Schemas ────

export const createProviderSchema = z.object({
  provider: z.string().min(1).max(100),
  apiKey: z.string().min(1).max(10000),
  name: z.string().min(1).max(200),
  priority: z.number().int().min(1).max(100).optional(),
  globalPriority: z.number().int().min(1).max(100).nullable().optional(),
  defaultModel: z.string().max(200).nullable().optional(),
  testStatus: z.string().max(50).optional(),
});

// ──── API Key Schemas ────

export const createKeySchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
});

// ──── Combo Schemas ────

export const createComboSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/, "Name can only contain letters, numbers, - and _"),
  models: z.array(z.string()).optional().default([]),
});

// ──── Settings Schemas ────

export const updateSettingsSchema = z.object({
  newPassword: z.string().min(1).max(200).optional(),
  currentPassword: z.string().max(200).optional(),
  theme: z.string().max(50).optional(),
  language: z.string().max(10).optional(),
  requireLogin: z.boolean().optional(),
}).passthrough(); // Allow extra fields for flexibility

// ──── Auth Schemas ────

export const loginSchema = z.object({
  password: z.string().min(1, "Password is required").max(200),
});

// ──── Helper ────

/**
 * Parse and validate request body with a Zod schema.
 * Returns { success: true, data } or { success: false, error }.
 */
export function validateBody(schema, body) {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: {
      message: "Invalid request",
      details: result.error.errors.map(e => ({
        field: e.path.join("."),
        message: e.message,
      })),
    },
  };
}
