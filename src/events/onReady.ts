const { ActivityType, Events } = require('discord.js');

// CommonJS export
module.exports = {
	name: Events.ClientReady,
	once: true,
	execute(client) {
		console.log(`Ready! Logged in as ${client.user.tag}`);

        // Set status
        client.user.setActivity("sex", {
            type: ActivityType.Playing,
        });
    
        // Set presence to DND
        client.user.setStatus("dnd");
	},
};