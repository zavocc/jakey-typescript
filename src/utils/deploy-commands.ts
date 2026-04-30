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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getConfigJsonKeySync } from "../lib/configuratorJSON.js";

const commands: unknown[] = [];
const commandNames = new Set<string>();
const runtimeExtension = path.extname(fileURLToPath(import.meta.url));

async function deployCommands(): Promise<void> {
  const foldersPath = fileURLToPath(new URL("../commands/", import.meta.url));
  const commandFilePaths: string[] = [foldersPath];
  const appId = getConfigJsonKeySync("app_id");
  const token = getConfigJsonKeySync("token");

  if (!appId || !token) {
    throw new Error("Missing 'app_id' or 'token' in config.json.");
  }

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

    if (pathStats.isFile() && currentPath.endsWith(runtimeExtension)) {
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
