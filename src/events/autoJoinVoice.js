import { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus, entersState } from '@discordjs/voice';
import { ChannelType } from 'discord.js';
import { logger } from '../utils/logger.js';

const TARGET_VOICE_CHANNEL_ID = '1415546159417655346';
const RECONNECT_DELAY_MS = 5000;

let reconnectTimeout = null;

function scheduleReconnect(client, guildId, channelId) {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  reconnectTimeout = setTimeout(() => {
    connectBotToVoice(client, guildId, channelId).catch((err) => {
      logger.error('[AutoJoinVoice] Reconnect attempt failed:', err);
    });
  }, RECONNECT_DELAY_MS);
}

export async function connectBotToVoice(client, guildId = null, channelId = TARGET_VOICE_CHANNEL_ID) {
  try {
    const channel =
      client.channels.cache.get(channelId) ||
      await client.channels.fetch(channelId).catch(() => null);

    if (!channel) {
      logger.warn(`[AutoJoinVoice] Voice channel ${channelId} not found.`);
      return null;
    }

    if (
      channel.type !== ChannelType.GuildVoice &&
      channel.type !== ChannelType.GuildStageVoice
    ) {
      logger.warn(`[AutoJoinVoice] Channel ${channelId} is not a voice or stage channel.`);
      return null;
    }

    const targetGuild = guildId
      ? client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null)
      : channel.guild;

    if (!targetGuild) {
      logger.warn(`[AutoJoinVoice] Guild not found for channel ${channelId}.`);
      return null;
    }

    const existingConnection = getVoiceConnection(targetGuild.id);
    if (existingConnection && existingConnection.joinConfig.channelId === channel.id) {
      return existingConnection;
    }

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: targetGuild.id,
      adapterCreator: targetGuild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });

    if (channel.type === ChannelType.GuildStageVoice && targetGuild.members.me?.voice) {
      await targetGuild.members.me.voice.setSuppressed(false).catch(() => {});
    }

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        connection.destroy();
        scheduleReconnect(client, targetGuild.id, channel.id);
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      scheduleReconnect(client, targetGuild.id, channel.id);
    });

    connection.on('error', (error) => {
      logger.error('[AutoJoinVoice] Voice connection error:', error);
      scheduleReconnect(client, targetGuild.id, channel.id);
    });

    logger.info(`[AutoJoinVoice] Joined voice channel "${channel.name}" (${channel.id}) in ${targetGuild.name}.`);
    return connection;
  } catch (error) {
    logger.error('[AutoJoinVoice] Failed to join voice channel:', error);
    scheduleReconnect(client, guildId, channelId);
    return null;
  }
}

export function initAutoJoinVoice(client) {
  client.once('clientReady', () => {
    connectBotToVoice(client);
  });

  client.on('voiceStateUpdate', (oldState, newState) => {
    if (oldState.member?.id === client.user?.id && !newState.channelId) {
      scheduleReconnect(client, oldState.guild.id, TARGET_VOICE_CHANNEL_ID);
    }
  });
}
