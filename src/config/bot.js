import { logger } from '../utils/logger.js';

export const botConfig = {
  // =========================
  // BOT PRESENCE
  // =========================
  presence: {
    // dnd = عدم الإزعاج (النقطة الحمراء)
    status: "dnd",

    activities: [
      {
        name: "Custom Status",
        state: "Cryot",
        type: 4,
      },
    ],
  },

  // =========================
  // COMMAND BEHAVIOR
  // =========================
  commands: {
    owners: process.env.OWNER_IDS?.split(",").map((id) => id.trim()).filter(Boolean) || [],
    defaultCooldown: 3,
    deleteCommands: false,
    testGuildId: process.env.TEST_GUILD_ID,
    maintenanceMode: process.env.MAINTENANCE_MODE === "true",
    prefix: process.env.PREFIX || "!",
  },

  // =========================
  // APPLICATIONS SYSTEM
  // =========================
  applications: {
    defaultQuestions: [
      { question: "What is your name?", required: true },
      { question: "How old are you?", required: true },
      { question: "Why do you want to join?", required: true },
    ],
    statusColors: {
      pending: "#FFA500",
      approved: "#00FF00",
