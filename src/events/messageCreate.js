import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { parsePrefixCommand } from '../utils/prefixParser.js';
import { supportsPrefixExecution, executePrefixCommand, resolvePrefixAccessKey } from '../utils/messageAdapter.js';
import { resolveCommandAlias, resolveSubcommandAlias } from '../config/commands/commandAliases.js';
import { getPrefixRestriction } from '../config/commands/prefixRestrictions.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import {
  getCommandPrefix,
  getBotMessage,
  isBotOwner,
  isCommandCategoryEnabled,
  isMaintenanceMode,
  isFeatureEnabled,
} from '../config/bot.js';
import { enforceAbuseProtection, formatCooldownDuration } from '../utils/abuseProtection.js';
import { createEmbed } from '../utils/embeds.js';
import { isCommandEnabled } from '../services/commandAccessService.js';
import {
  getCountingGameConfig,
  saveCountingGameConfig,
  isValidCountingMessage,
  recordCorrectCount,
} from '../services/countingGameService.js';

// الرتبة المطلوبة لتفعيل أوامر القبول/الرفض والردود التلقائية
const REQUIRED_AUTO_REPLY_ROLE_ID = '1414619238684950662';

// روم استقبال نتائج القبول والرفض
const APPLICATION_RESULTS_CHANNEL_ID = '1567239474482643044';

// صورة مصغرة داكنة مطابقة للشكل المطلوب في الإمبد
const DARK_THUMBNAIL_URL = 'https://dummyimage.com/160x160/1e1f22/1e1f22.png';

const AUTO_REPLIES = [
  {
    triggers: ['خط'],
    reply: `https://cdn.discordapp.com/attachments/1399176418415607870/1468651951339339796/1339174610775703626.gif?ex=6b0124f7&is=6affd377&hm=2403d860306f5127772df1d0106e2bed5a2630f8225bebf2830d38ad7ae4d71f&`,
    exact: false,
    useEmbed: false,
  },
  {
    triggers: ['رابط'],
    reply: `𝐃𝐙  𝐓𝐎𝐏  | 𝐌𝐎𝐃𝐒  2𝐊
https://discord.gg/CdGddfWQZq`,
    exact: false,
    useEmbed: false,
  },
];

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      if (message.author.bot || !message.guild) return;

      logger.debug(`Message received from ${message.author.tag}:${message.content}`);

      const countingProcessed = await handleCountingGame(message, client);
      if (countingProcessed) {
        return;
      }

      const prefixProcessed = await handlePrefixCommand(message, client);
      if (!prefixProcessed) {
        const handledDecision = await handleApplicationDecision(message);
        if (!handledDecision) {
          await handleAutoReply(message);
        }
      }
    } catch (error) {
      logger.error('Error in messageCreate event:', error);
    }
  }
};

async function resolveTargetApplicant(message) {
  if (message.mentions.users.size > 0) {
    return message.mentions.users.first();
  }

  if (message.reference?.messageId) {
    const repliedMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
    if (repliedMsg?.author && !repliedMsg.author.bot) {
      return repliedMsg.author;
    }
  }

  const idMatch = message.content.match(/\b\d{17,20}\b/);
  if (idMatch) {
    const fetchedUser = await message.client.users.fetch(idMatch[0]).catch(() => null);
    if (fetchedUser && !fetchedUser.bot) {
      return fetchedUser;
    }
  }

  return null;
}

function formatDateTime(date = new Date()) {
  const pad = (num) => String(num).padStart(2, '0');
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${day}/${month}/${year}${hours}:${minutes}`; }  async function handleApplicationDecision(message) { try { if (!isFeatureEnabled('utility')) { return false; }  const member = message.member \vert{}\vert{} await message.guild.members.fetch(message.author.id).catch(() => null); if (!member \vert{}\vert{} !member.roles.cache.has(REQUIRED_AUTO_REPLY_ROLE_ID)) { return false; }  const rawContent = message.content?.trim(); if (!rawContent) { return false; }  const hasApproveKeyword = /(^\vert{}\s)قبول(\s\vert{}$)/u.test(rawContent); const hasDenyKeyword = /(^\vert{}\s)رفض(\s\vert{}$)/u.test(rawContent);  if (!hasApproveKeyword && !hasDenyKeyword) { return false; }  const targetUser = await resolveTargetApplicant(message); if (!targetUser) { await message.reply({ content: '⚠️ يرجى منشن العضو أو الرد على رسالته عند كتابة `قبول` أو `رفض`.', allowedMentions: { repliedUser: false }, }).catch(() => {}); return true; }  const isApproved = hasApproveKeyword; const statusText = isApproved ? 'تم قبول تقديم ✅' : 'تم رفض تقديم ❌'; const guildIcon = message.guild.iconURL({ dynamic: true, size: 256 }) \vert{}\vert{} undefined;  const resultEmbed = createEmbed({ author: { name: message.guild.name, iconURL: guildIcon, }, thumbnail: DARK_THUMBNAIL_URL, description: `${statusText}\n\nصاحب التقديم: <@${targetUser.id}>\nالإداري: <@${message.author.id}>`,
      footer: {
        text: formatDateTime(),
      },
      color: 'primary',
    });

    const targetChannel =
      message.guild.channels.cache.get(APPLICATION_RESULTS_CHANNEL_ID) ||
      await message.guild.channels.fetch(APPLICATION_RESULTS_CHANNEL_ID).catch(() => null);

    if (!targetChannel || !targetChannel.isTextBased()) {
      logger.warn(`Results channel ${APPLICATION_RESULTS_CHANNEL_ID} not found or not text-based.`);
      await message.reply({
        content: `❌ لم أتمكن من
