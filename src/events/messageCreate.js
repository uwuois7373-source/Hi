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
const REQUIRED_AUTO_REPLY_ROLE_ID = '1414759117087838330';

// روم استقبال نتائج القبول والرفض
const APPLICATION_RESULTS_CHANNEL_ID = '1567239474482643044';

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

      logger.debug(`Message received from ${message.author.tag}: ${message.content}`);

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

async function handleApplicationDecision(message) {
  try {
    if (!isFeatureEnabled('utility')) {
      return false;
    }

    const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!member || !member.roles.cache.has(REQUIRED_AUTO_REPLY_ROLE_ID)) {
      return false;
    }

    const rawContent = message.content?.trim();
    if (!rawContent) {
      return false;
    }

    const hasApproveKeyword = /(^|\s)تفضل(\s|$)/u.test(rawContent);
    const hasDenyKeyword = /(^|\s)رفض(\s|$)/u.test(rawContent);

    if (!hasApproveKeyword && !hasDenyKeyword) {
      return false;
    }

    const targetUser = await resolveTargetApplicant(message);
    if (!targetUser) {
      await message.reply({
        content: '⚠️ يرجى منشن العضو أو الرد على رسالته عند كتابة `تفضل` أو `رفض`.',
        allowedMentions: { repliedUser: false },
      }).catch(() => {});
      return true;
    }

    const isApproved = hasApproveKeyword;
    const statusText = isApproved ? 'تم قبول تقديم ✅' : 'تم رفض تقديم ❌';

    const resultEmbed = createEmbed({
      author: {
        name: message.guild.name,
        iconURL: message.guild.iconURL({ dynamic: true }) || undefined,
      },
      description: `${statusText}\nصاحب التقديم: <@${targetUser.id}>\nالإداري: <@${message.author.id}>`,
      color: 'primary',
      timestamp: true,
    });

    const targetChannel =
      message.guild.channels.cache.get(APPLICATION_RESULTS_CHANNEL_ID) ||
      await message.guild.channels.fetch(APPLICATION_RESULTS_CHANNEL_ID).catch(() => null);

    if (!targetChannel || !targetChannel.isTextBased()) {
      logger.warn(`Results channel ${APPLICATION_RESULTS_CHANNEL_ID} not found or not text-based.`);
      await message.reply({
        content: '❌ لم أتمكن من العثور على روم النتائج `1567239474482643044` أو البوت يفتقر لصلاحية الإرسال فيه.',
        allowedMentions: { repliedUser: false },
      }).catch(() => {});
      return true;
    }

    await targetChannel.send({
      content: `<@${targetUser.id}>`,
      embeds: [resultEmbed],
      allowedMentions: { users: [targetUser.id] },
    });

    await message.reply({
      content: isApproved
        ? `تم قبول التقديم بنجاح وإرسال النتيجة إلى <#${APPLICATION_RESULTS_CHANNEL_ID}>.`
        : `تم رفض التقديم بنجاح وإرسال النتيجة إلى <#${APPLICATION_RESULTS_CHANNEL_ID}>.`,
      allowedMentions: { repliedUser: false },
    }).catch(() => {});

    return true;
  } catch (error) {
    logger.error('Error handling application decision:', error);
    return false;
  }
}

async function handleAutoReply(message) {
  try {
    if (!isFeatureEnabled('utility')) {
      return;
    }

    const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!member || !member.roles.cache.has(REQUIRED_AUTO_REPLY_ROLE_ID)) {
      return;
    }

    const rawContent = message.content?.trim();
    if (!rawContent) {
      return;
    }

    const normalizedContent = rawContent.toLowerCase();

    for (const item of AUTO_REPLIES) {
      const matched = item.triggers.some((trigger) => {
        const cleanTrigger = String(trigger).trim().toLowerCase();
        if (!cleanTrigger) return false;
        return item.exact
          ? normalizedContent === cleanTrigger
          : normalizedContent.includes(cleanTrigger);
      });

      if (!matched) {
        continue;
      }

      if (item.useEmbed) {
        await message.reply({
          embeds: [
            createEmbed({
              title: item.title || 'Auto Reply',
              description: item.reply,
              color: 'primary',
            }),
          ],
          allowedMentions: { repliedUser: false },
        }).catch(() => {});
      } else {
        await message.reply({
          content: item.reply,
          allowedMentions: { repliedUser: false, parse: ['users'] },
        }).catch(() => {});
      }

      break;
    }
  } catch (error) {
    logger.error('Error handling auto-reply:', error);
  }
}

async function handlePrefixCommand(message, client) {
  try {
    const guildConfig = await getGuildConfig(client, message.guild.id);
    const prefix = guildConfig?.prefix || getCommandPrefix();
    const parsed = parsePrefixCommand(message.content, prefix);
    
    if (!parsed) {
      return false; 
    }

    let { commandName, args } = parsed;
    const musicPrefixShortcut = commandName.toLowerCase();
    const MUSIC_PREFIX_SHORTCUTS = new Set(['leave', 'pause', 'resume', 'skip', 'stop', 'volume']);
    if (MUSIC_PREFIX_SHORTCUTS.has(musicPrefixShortcut)) {
      commandName = 'music';
      args = [musicPrefixShortcut, ...args];
    }

    logger.info(`Prefix command detected: ${commandName}, args: ${args.join(', ')}`);

    const resolvedCommandName = resolveCommandAlias(commandName);
    logger.info(`Resolved command name: ${resolvedCommandName}`);
    const command = client.commands.get(resolvedCommandName);

    if (!command) {
      logger.warn(`Command not found: ${resolvedCommandName}`);
      return true; 
    }

    if (isMaintenanceMode() && !isBotOwner(message.author.id)) {
      await message.channel.send({
        embeds: [createEmbed({
          title: 'Maintenance Mode',
          description: getBotMessage('maintenanceMode'),
          color: 'warning',
        })],
      }).catch(() => {});
      return true;
    }

    if (!isCommandCategoryEnabled(command.category)) {
      await message.channel.send({
        embeds: [createEmbed({
          title: 'Feature Disabled',
          description: getBotMessage('commandDisabled'),
          color: 'error',
        })],
      }).catch(() => {});
      return true;
    }

    const restriction = getPrefixRestriction(command, args, resolveSubcommandAlias);
    if (!supportsPrefixExecution(command) || restriction.blocked) {
      if (restriction.blocked && restriction.reason) {
        const embed = createEmbed({
          title: 'Slash Command Only',
          description: `${restriction.reason}\nUse \`/${resolvedCommandName}\` instead.`,
          color: 'info',
        });
        await message.channel.send({ embeds: [embed] }).catch(() => {});
      }
      return true;
    }

    if (!(await isCommandEnabled(client, message.guild.id, resolvePrefixAccessKey(command.data, args), command.category))) {
      const embed = createEmbed({
        title: 'Command Disabled',
        description: 'This command has been disabled for this server.',
        color: 'error',
      });
      await message.channel.send({ embeds: [embed] }).catch(() => {});
      return true;
    }

    const mockInteractionForProtection = {
      guildId: message.guild.id,
      user: message.author,
    };
    const abuseProtection = await enforceAbuseProtection(
      mockInteractionForProtection,
      command,
      resolvedCommandName,
    );
    if (!abuseProtection.allowed) {
      const formattedCooldown = formatCooldownDuration(abuseProtection.remainingMs);
      const embed = createEmbed({
        title: 'Command Cooldown',
        description: `This command is on cooldown. Please wait ${formattedCooldown} before trying again.`,
        color: 'error',
      });
      await message.channel.send({ embeds: [embed] }).catch(() => {});
      return true;
    }

    logger.info(`Executing prefix command: ${prefix}${commandName} (resolved to ${resolvedCommandName}) by ${message.author.tag}`);
    
    await executePrefixCommand(command, message, args, client, prefix, guildConfig);
    return true;
  } catch (error) {
    logger.error('Error handling prefix command:', error);
    return false;
  }
}

async function handleCountingGame(message, client) {
  try {
    const config = await getCountingGameConfig(client, message.guild.id);
    if (!config.enabled || !config.channelId || message.channel.id !== config.channelId) {
      return false;
    }

    const content = message.content.trim();
    const validCount = isValidCountingMessage(content, config);
    const invalidAttempt = !validCount || message.author.id === config.lastUserId;

    if (invalidAttempt) {
      await message.delete().catch(() => {});
      await saveCountingGameConfig(client, message.guild.id, {
        ...config,
        nextNumber: 1,
        lastUserId: null,
        currentStreak: 0,
      });

      const failureMessage = await message.channel.send(`❌ Count broken by <@${message.author.id}>. The sequence has been reset to **1**.`);
      setTimeout(() => {
        failureMessage.delete().catch(() => {});
      }, 10000);

      return true;
    }

    await recordCorrectCount(client, message.guild.id, message.author.id);
    return true;
  } catch (error) {
    logger.error('Error handling counting game:', error);
    return false;
  }
}
