import "./lib/initEnv.js"
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

// TODO: to polish
import { startServices } from "./lib/services/services.js";

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
      console.log(`[INFO] Loaded command: ${command.data.name} from ${currentPath}`);
    } else {
      console.log(
        `[WARNING] The command at ${currentPath} is missing a required "data" or "execute" property.`,
      );
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
    console.log(`[INFO] Loaded event: ${event.name} from ${filePath}`);
  }
}

// Start services and log in
async function bootstrap() {
  await loadCommands();
  await loadEvents();
  await startServices();
  if (!process.env.TOKEN) {
    console.error("Token not found in config.json");
    process.exit(1);
  }
  await botClient.login(process.env.TOKEN);
}

bootstrap().catch((error) => {
  console.error("Startup failed:", error);
  process.exit(1);
});
