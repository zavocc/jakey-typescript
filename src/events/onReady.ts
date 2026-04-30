import { ActivityType, Client, Events } from "discord.js";

export default {
  name: Events.ClientReady,
  once: true,
  execute(client: Client) {
    // check if client.user is available
    if (!client.user) {
      throw new Error("Client user is not available.");
    }

    console.log(`Ready! Logged in as ${client.user.tag}`);

    // Set status
    client.user.setActivity("sex", {
      type: ActivityType.Playing,
    });

    // Set presence to DND
    client.user.setStatus("dnd");
  },
};
