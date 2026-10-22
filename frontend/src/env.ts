import { z } from "zod";

const envSchema = z.object({
  // Server-side only
  API_BASE_URL: z.string().url().default("http://127.0.0.1:8000"),
  SESSION_COOKIE_SECURE: z
    .string()
    .optional()
    .transform((val) => val === "true"),

  // Client-exposed
  NEXT_PUBLIC_APP_NAME: z
    .string()
    .min(1)
    .default("BuildTrack Monitoring"),
  NEXT_PUBLIC_WS_URL: z.string().url().default("http://127.0.0.1:8000"),
  NEXT_PUBLIC_MAPTILE_URL: z
    .string()
    .optional()
    .default("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"),
  NEXT_PUBLIC_USE_MOCKS: z
    .string()
    .optional()
    .transform((val) => val === "true")
    .default(false),
  NEXT_PUBLIC_BASE_PATH: z.string().optional().default(""),
});

export const env = envSchema.parse({
  API_BASE_URL: process.env.API_BASE_URL,
  SESSION_COOKIE_SECURE: process.env.SESSION_COOKIE_SECURE,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
  NEXT_PUBLIC_MAPTILE_URL: process.env.NEXT_PUBLIC_MAPTILE_URL,
  NEXT_PUBLIC_USE_MOCKS: process.env.NEXT_PUBLIC_USE_MOCKS,
  NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH,
});
