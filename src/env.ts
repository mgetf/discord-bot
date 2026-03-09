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
    VERIFY_ADD_ROLE_IDS: z
      .string()
      .min(1, 'VERIFY_ADD_ROLE_IDS is required')
      .transform((val) => val.split(',').map((id) => id.trim()).filter(Boolean)),
    VERIFY_REMOVE_ROLE_IDS: z
      .string()
      .optional()
      .default('')
      .transform((val) => val.split(',').map((id) => id.trim()).filter(Boolean)),
    VERIFICATION_CHANNEL_ID: z.string().optional(),
    VERIFICATION_LOG_CHANNEL_ID: z.string().optional(),
    LOG_LEVEL: z
      .enum(['debug', 'info', 'warn', 'error'])
      .optional()
      .default('info')
  }
});
