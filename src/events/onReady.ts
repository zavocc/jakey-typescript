import { createModuleLogger } from "../lib/pinoLogger.js";
import { ActivityType, Client, Events } from "discord.js";

const childLogger = createModuleLogger(import.meta.url);

export default {
  name: Events.ClientReady,
  once: true,
  execute(client: Client) {
    // check if client.user is available
    if (!client.user) {
      throw new Error("Client user is not available.");
    }

    childLogger.info({ client_user_tag: client.user.tag }, "Ready! Logged in");

    // Set status
    client.user.setActivity("sex", {
      type: ActivityType.Playing,
    });

    // Set presence to DND
    client.user.setStatus("dnd");
  },
};
