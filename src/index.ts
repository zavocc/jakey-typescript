import { getConfigJsonKey } from "./lib/configuratorJSON";
import {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
} from "discord.js";
import fs from "fs";
import path from "path";

// TODO: to polish
import { startServices } from "./lib/services/services";

// Create a new client instance
const botClient: Client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel],
});

// Register commands
botClient.commands = new Collection();

const foldersPath = path.join(__dirname, "commands");
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".ts") || file.endsWith(".js"));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const loaded = require(filePath);
    const command = loaded.default ?? loaded;
    // Set a new item in the Collection with the key as the command name and the value as the exported module
    if ("data" in command && "execute" in command) {
      botClient.commands.set(command.data.name, command);
      console.log(`[INFO] Loaded command: ${command.data.name} from ${filePath}`);
    } else {
      console.log(
        `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`,
      );
    }
  }
}

// load events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.ts') || file.endsWith('.js'));
for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath); // Requires CJS as ESM imports require async, which Discord.JS top level does not support yet
  if (event.once) {
    botClient.once(event.name, (...args) => event.execute(...args));
  } else {
    botClient.on(event.name, (...args) => event.execute(...args));
  }
  console.log(`[INFO] Loaded event: ${event.name} from ${filePath}`);
}

// Start services and log in
async function bootstrap() {
  await startServices();
  const token = await getConfigJsonKey("token");
  if (!token) {
    console.error("Token not found in config.json");
    process.exit(1);
  }
  await botClient.login(token);
}

bootstrap().catch((error) => {
  console.error("Startup failed:", error);
  process.exit(1);
});
