// Mostly taken from https://discordjs.guide/legacy/app-creation/deploying-commands
// But with casting and other typescript-specific stuff

import { Client, GatewayIntentBits, REST, Routes } from "discord.js";
import { app_id, token } from "../config.json";
import fs from "node:fs";
import path from "node:path";

const commands = [];
const commandNames = new Set<string>();
// Grab all the command folders from the commands directory you created earlier
const foldersPath = path.join(__dirname, "../commands");
const commandFilePaths: string[] = [foldersPath];

for (let i = 0; i < commandFilePaths.length; i++) {
  const currentPath = commandFilePaths[i];
  const pathStats = fs.statSync(currentPath);

  if (pathStats.isDirectory()) {
    const entries = fs.readdirSync(currentPath);
    for (const entry of entries) {
      commandFilePaths.push(path.join(currentPath, entry));
    }
    continue;
  }

  if (pathStats.isFile() && currentPath.endsWith(".ts")) {
    // Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
    const loaded = require(currentPath);
    const command = loaded.default ?? loaded;
    if ("data" in command && "execute" in command) {
      const commandJson = command.data.toJSON();
      if (commandNames.has(commandJson.name)) {
        console.log(
          `[WARNING] Duplicate command name "${commandJson.name}" at ${currentPath}; skipping duplicate.`,
        );
        continue;
      }

      commandNames.add(commandJson.name);
      commands.push(commandJson);
    } else {
      console.log(
        `[WARNING] The command at ${currentPath} is missing a required "data" or "execute" property.`,
      );
    }
  }
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(token);

async function clearGuildCommands() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  try {
    await client.login(token);
    await client.guilds.fetch(); // Fetch guilds to populate the cache and clear commands for each guild

    for (const guildId of client.guilds.cache.keys()) {
      await rest.put(Routes.applicationGuildCommands(app_id, guildId), {
        body: [],
      });
      console.log(`Cleared guild application (/) commands for ${guildId}.`);
    }
  } finally {
    client.destroy();
  }
}

// and deploy your commands!
(async () => {
  try {
    await clearGuildCommands();
    await rest.put(Routes.applicationCommands(app_id), { body: [] });
    console.log("Cleared global application (/) commands.");

    console.log(
      `Started refreshing ${commands.length} application (/) commands.`,
    );

    // The put method is used to fully refresh all global commands with the current set
    const data = (await rest.put(
      Routes.applicationCommands(app_id),
      { body: commands },
    )) as unknown[];

    console.log(
      `Successfully reloaded ${data.length} application (/) commands.`,
    );
  } catch (error) {
    // And of course, make sure you catch and log any errors!
    console.error(error);
  }
})();
