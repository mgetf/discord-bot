import { Events } from 'discord.js';
import type { Event } from '@/types';
import { verifyLinkedMember } from '@/utils/verification';

const VERIFY_REASON = 'mge.tf Discord linked';

export const event: Event<Events.GuildMemberAdd> = {
  name: Events.GuildMemberAdd,
  runOnce: false,
  execute: async (member) => {
    await verifyLinkedMember(member, VERIFY_REASON);
  }
};
