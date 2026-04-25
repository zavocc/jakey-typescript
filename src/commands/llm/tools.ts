import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from "discord.js";
import { fetchListAvailableTool } from "../../tools/utils";
import { loadPreferences, savePreferences } from "../../lib/preferencesDBLoader";
import { DeleteGeminiInteractionID } from "../../lib/llm/geminiInteractionsMgmt";

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

    // Obtain current Gemini interaction ID so we can clear context
    const curGeminiInteractionID = await loadPreferences(interaction.user.id, "current_interaction_id");

    if (subcmd == "set") {
      const selectedTool = interaction.options.getString("tool_name", true);

      // Defer
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Obtain tool human name to show for user UX, otherwise fallback to actual tool name value from directories
      const availableTools = await fetchListAvailableTool();
      const selectedToolInfo = availableTools.find((tool) => tool.name === selectedTool);
      const selectedToolHumanName = selectedToolInfo?.human_name ?? selectedTool;

      // Clear chat and set tools
      try {
        if (curGeminiInteractionID) {
          await DeleteGeminiInteractionID(curGeminiInteractionID, interaction.user.id);
        }
      } catch (error) {
        console.error(`Error deleting interaction for user ${interaction.user.id}:`, error);
        throw error;
      }
      await savePreferences(interaction.user.id, "current_interaction_id", null);
      await savePreferences(interaction.user.id, "user_choice_tool", selectedTool);

      // Done
      console.log(`Selected tool: ${selectedTool}`);
      await interaction.editReply({ content: `Tools are loaded from **${selectedToolHumanName}** and chat is reset.` });
    }
  }
};
