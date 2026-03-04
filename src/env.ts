import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  runtimeEnv: process.env,
  server: {
    DISCORD_BOT_TOKEN: z.string().min(1, 'DISCORD_BOT_TOKEN is required'),
    DISCORD_APPLICATION_ID: z
      .string()
      .min(1, 'DISCORD_APPLICATION_ID is required'),
    DISCORD_GUILD_ID: z.string().optional(),
    MGE_API_URL: z.string().url('MGE_API_URL must be a valid URL'),
    MGE_API_KEY: z.string().min(1, 'MGE_API_KEY is required'),
    VERIFIED_ROLE_ID: z.string().min(1, 'VERIFIED_ROLE_ID is required'),
    VERIFICATION_CHANNEL_ID: z.string().optional(),
    LOG_LEVEL: z
      .enum(['debug', 'info', 'warn', 'error'])
      .optional()
      .default('info')
  }
});
