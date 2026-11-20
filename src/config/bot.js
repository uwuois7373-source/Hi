import { logger } from '../utils/logger.js';

export const botConfig = {
  presence: {
    status: "online",
    activities: [
      {
        name: "dms for support",
        type: 2,
      },
    ],
  },

  commands: {
    owners: process.env.OWNER_IDS?.split(",").map((id) => id.trim()).filter(Boolean) || [],
    defaultCooldown: 3,
    deleteCommands: false,
    testGuildId: process.env.TEST_GUILD_ID,
    maintenanceMode: process.env.MAINTENANCE_MODE === "true",
    prefix: process.env.PREFIX || "!",
  },

  applications: {
    defaultQuestions: [
      { question: "What is your name?", required: true },
      { question: "How old are you?", required: true },
      { question: "Why do you want to join?", required: true },
    ],
    statusColors: {
      pending: "#ED4245",
      approved: "#ED4245",
      denied: "#ED4245",
    },
    applicationCooldown: 24,
    deleteDeniedAfter: 7,
    deleteApprovedAfter: 30,
    managerRoles: [],
  },

  embeds: {
    colors: {
      primary: "#ED4245",
      secondary: "#B71C1C",
      success: "#ED4245",
      error: "#ED4245",
      warning: "#ED4245",
      info: "#ED4245",
      light: "#FF6B6B",
      dark: "#7F0000",
      gray: "#C62828",
      blurple: "#ED4245",
      green: "#ED4245",
      yellow: "#ED4245",
      fuchsia: "#ED4245",
      red: "#ED4245",
      black: "#7F0000",
      giveaway: {
        active: "#ED4245",
        ended: "#B71C1C",
      },
      ticket: {
        open: "#ED4245",
        claimed: "#E53935",
        closed: "#B71C1C",
        pending: "#C62828",
      },
      economy: "#ED4245",
      birthday: "#ED4245",
      moderation: "#ED4245",
      priority: {
        none: "#C62828",
        low: "#E57373",
        medium: "#EF5350",
        high: "#E53935",
        urgent: "#B71C1C",
      },
    },
    footer: {
      text: "Titan Bot",
      icon: null,
    },
    thumbnail: null,
    author: {
      name: null,
      icon: null,
      url: null,
    },
  },

  economy: {
    currency: {
      name: "coins",
      namePlural: "coins",
      symbol: "$",
    },
    startingBalance: 0,
    baseBankCapacity: 100000,
    dailyAmount: 100,
    workMin: 10,
    workMax: 100,
    begMin: 5,
    begMax: 50,
    cooldowns: {
      daily: 24 * 60 * 60 * 1000,
      work: 60 * 60 * 1000,
      crime: 2 * 60 * 60 * 1000,
      rob: 4 * 60 * 60 * 1000,
    },
    robSuccessRate: 0.4,
    robFailJailTime: 3600000,
  },

  shop: {

  },

  tickets: {
    defaultCategory: null,
    supportRoles: [],
    priorities: {
      none: {
        emoji: "⚪",
        color: "#C62828",
        label: "None",
      },
      low: {
        emoji: "🟢",
        color: "#E57373",
        label: "Low",
      },
      medium: {
        emoji: "🟡",
        color: "#EF5350",
        label: "Medium",
      },
      high: {
        emoji: "🔴",
        color: "#E53935",
        label: "High",
      },
      urgent: {
        emoji: "🚨",
        color: "#B71C1C",
        label: "Urgent",
      },
    },
    defaultPriority: "none",
    archiveCategory: null,
    logChannel: null,
  },

  giveaways: {
    defaultDuration: 86400000,
    minimumWinners: 1,
    maximumWinners: 10,
    minimumDuration: 300000,
    maximumDuration: 2592000000,
    allowedRoles: [],
    bypassRoles: [],
  },

  birthday: {
