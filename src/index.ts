// import token from config.json
import config from "./config.json";

import {
  ActivityType,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  MessageFlags,
} from "discord.js";
import fs from "fs";
import path from "path";
import { HELP_MESSAGE } from "./constants";

// Create a new client instance
const botClient: Client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

botClient.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);

  // Set status
  readyClient.user.setActivity("sex", {
    type: ActivityType.Playing,
  });

  // Set presence to DND
  readyClient.user.setStatus("idle");
});

// Register commands
botClient.commands = new Collection();

const foldersPath = path.join(__dirname, "commands");
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".ts"));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const loaded = require(filePath);
    const command = loaded.default ?? loaded;
    // Set a new item in the Collection with the key as the command name and the value as the exported module
    if ("data" in command && "execute" in command) {
      botClient.commands.set(command.data.name, command);
    } else {
      console.log(
        `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`,
      );
    }
  }
}

botClient.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = botClient.commands.get(interaction.commandName);
  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);

    // Check if the interaction has already been acknowledged to decide whether to reply or follow-up
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "There was an error while executing this command!",
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: "There was an error while executing this command!",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
});

// Add MessageCreate event handler
botClient.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // If the bot is mentioned, respond with a ping
  if (message.mentions.has(botClient.user)) {
    await message.reply({
      content: HELP_MESSAGE(message.author.id, botClient.user.username),
    });
  }
});

// Log in to Discord with your client's token
botClient.login(config.token);
