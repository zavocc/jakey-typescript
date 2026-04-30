/**
  For more information, see [1]

  By default, this command deploys commands across all servers thru [2]

  Any previously deployed commands that is scoped through guilds as documented in [3] requires manual deletion to ensure sync
  This code does not have guild-specific registration and deletion however, so this script assumes no guild-specific commands are registered before.

  [1] https://discordjs.guide/legacy/app-creation/deploying-commands
  [2] https://discordjs.guide/legacy/app-creation/deploying-commands#global-commands
  [3] https://discordjs.guide/legacy/app-creation/deploying-commands#guild-commands
*/

import { REST, Routes } from "discord.js";
import fg from "fast-glob";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getConfigJsonKeySync } from "../lib/configuratorJSON.js";

const commands: unknown[] = [];
const commandNames = new Set<string>();
const runtimeExtension = path.extname(fileURLToPath(import.meta.url)); // determine the runtime extension (e.g. .ts or .js) by basing off the current file's extension

async function deployCommands(): Promise<void> {
  const foldersPath = fileURLToPath(new URL("../commands/", import.meta.url));
  const commandFilePaths = await fg(`**/*${runtimeExtension}`, {
    cwd: foldersPath,
    absolute: true,
    onlyFiles: true,
  });
  const appId = getConfigJsonKeySync("app_id");
  const token = getConfigJsonKeySync("token");

  if (!appId || !token) {
    throw new Error("Missing 'app_id' or 'token' in config.json.");
  }

  commandFilePaths.sort();

  for (const currentPath of commandFilePaths) {
    const loaded = await import(pathToFileURL(currentPath).href);
    const command = loaded.default;
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

  const rest = new REST().setToken(token);

  try {
    console.log(
      `Started refreshing ${commands.length} application (/) commands.`,
    );

    // The put method is used to fully refresh all global commands with the current set
    const data = (await rest.put(
      Routes.applicationCommands(appId),
      { body: commands },
    )) as unknown[];

    console.log(
      `Successfully reloaded ${data.length} application (/) commands.`,
    );
  } catch (error) {
    // And of course, make sure you catch and log any errors!
    console.error(error);
  }
}

void deployCommands();
