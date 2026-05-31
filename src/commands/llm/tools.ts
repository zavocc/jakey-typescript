import logger from "../../lib/pinoLogger.js";
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from "discord.js";
import { fetchListAvailableTool } from "../../llm/tools/utils.js";
import { clearContext } from "../../llm/chat/contextMemory.js";
import { savePreferences } from "../../lib/preferencesDBLoader.js";

const childLogger = logger.child({ module: "commands.llm.tools" });

export default {
  data: new SlashCommandBuilder()
    .setName("tools")
    .setDescription("Enhance your chat with tools, connect to services, perform tasks, and more.")
    .addSubcommand((subcommand: SlashCommandSubcommandBuilder) =>
      subcommand
        .setName("set")
        .setDescription("Set tool")
        .addStringOption((option) =>
          option
            .setName("tool_name")
            .setDescription("The name of the tool to use")
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),
  async autocomplete(interaction: AutocompleteInteraction) {
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name !== "tool_name") {
      await interaction.respond([]);
      return;
    }

    const availableTools = await fetchListAvailableTool();

    // Map
    const query = focusedOption.value.toLowerCase();
    const matches = availableTools
      .filter((tool) => tool.human_name.toLowerCase().includes(query))
      .slice(0, 25)
      .map((tool) => ({
        name: tool.human_name,
        value: tool.name,
      }));

    await interaction.respond(matches);
  },
  async execute(interaction: ChatInputCommandInteraction) {
    // Perform operations to set the tool based on user input
    const subcmd = interaction.options.getSubcommand();

    if (subcmd == "set") {
      const selectedTool = interaction.options.getString("tool_name", true);

      // Defer
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Obtain tool human name to show for user UX, otherwise fallback to actual tool name value from directories
      const availableTools = await fetchListAvailableTool();
      const selectedToolInfo = availableTools.find((tool) => tool.name === selectedTool);
      const selectedToolHumanName = selectedToolInfo?.human_name ?? selectedTool;

      // Save user choice tool preference
      await savePreferences(interaction.user.id, "user_choice_tool", selectedTool);

      // Delete chat history
      await clearContext(interaction.user.id);

      // Done
      childLogger.info({ tool_set: selectedTool, user_snowflake: interaction.user.id }, "Selected tool for the user");
      await interaction.editReply({ content: `Tools are loaded from **${selectedToolHumanName}** and chat is reset.` });
    }
  }
};
