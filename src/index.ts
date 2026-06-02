import "./lib/initEnv.js";
import { createModuleLogger } from "./lib/pinoLogger.js";
import {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
} from "discord.js";
import fg from "fast-glob";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const childLogger = createModuleLogger(import.meta.url, "main_index");

// TODO: to polish
import { startServices } from "./lib/services/index.js";

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

// determine the runtime extension (e.g. .ts or .js) by basing off the current file's extension
const runtimeExtension = path.extname(fileURLToPath(import.meta.url));

async function loadCommands(): Promise<void> {
  const commandsPath = fileURLToPath(new URL("./commands/", import.meta.url));
  const commandFilePaths = await fg(`**/*${runtimeExtension}`, {
    cwd: commandsPath,
    absolute: true,
    onlyFiles: true,
  });

  commandFilePaths.sort();

  for (const currentPath of commandFilePaths) {
    const loaded = await import(pathToFileURL(currentPath).href);
    const command = loaded.default;
    if ("data" in command && "execute" in command) {
      botClient.commands.set(command.data.name, command);
      childLogger.info({ command_name: command.data.name, command_path: currentPath }, "Loaded command successfully...");
    } else {
      childLogger.warn({ command_path: currentPath }, "This command is missing a required \"data\" or \"execute\" property.");
    }
  }
}

async function loadEvents(): Promise<void> {
  const eventsPath = fileURLToPath(new URL("./events/", import.meta.url));
  const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith(runtimeExtension));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const loaded = await import(pathToFileURL(filePath).href);
    const event = loaded.default;
    if (event.once) {
      botClient.once(event.name, (...args) => event.execute(...args));
    } else {
      botClient.on(event.name, (...args) => event.execute(...args));
    }
    childLogger.info({ event_name: event.name, event_path: filePath }, "Loaded event");
  }
}

// Start services and log in
async function bootstrap() {
  await loadCommands();
  await loadEvents();
  await startServices();
  if (!process.env.DISCORD_TOKEN) {
    childLogger.error("DISCORD_TOKEN not found in environment variables.");
    process.exit(1);
  }
  await botClient.login(process.env.DISCORD_TOKEN);
}

bootstrap().catch((error) => {
  childLogger.error({ err: error }, "Startup failed:");
  process.exit(1);
});
