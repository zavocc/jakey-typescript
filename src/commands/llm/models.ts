import { savePreferences } from "../../lib/preferencesDBLoader";
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from "discord.js";
import { readFile } from "node:fs/promises";
import path from "node:path";

type ModelsFile = {
  models: Array<{
    model_alias: string;
  }>;
};

async function loadModelsFile(): Promise<ModelsFile> {
  const modelsPath = path.resolve(process.cwd(), "src", "models.json");
  const raw = await readFile(modelsPath, "utf-8");
  return JSON.parse(raw) as ModelsFile;
}

export default {
  data: new SlashCommandBuilder()
    .setName("model")
    .setDescription("Actions to set models")
    .addSubcommand((subcommand: SlashCommandSubcommandBuilder) =>
      subcommand
        .setName("set")
        .setDescription("Set the AI model for the user")
        .addStringOption((option) =>
          option
            .setName("model_name")
            .setDescription("The name of the model to use")
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),
  async autocomplete(interaction: AutocompleteInteraction) {
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name !== "model_name") {
      await interaction.respond([]);
      return;
    }

    const { models } = await loadModelsFile();
    const query = focusedOption.value.toLowerCase();
    const matches = models
      .filter((model) => model.model_alias.toLowerCase().includes(query))
      .slice(0, 25)
      .map((model) => ({
        name: model.model_alias,
        value: model.model_alias,
      }));

    await interaction.respond(matches);
  },
  async execute(interaction: ChatInputCommandInteraction) {
    // Perform operations to set the model based on user input
    const subcmd = interaction.options.getSubcommand();

    if (subcmd == "set") {
      const selectedModelAlias = interaction.options.getString("model_name", true);

      console.log(`Selected model alias: ${selectedModelAlias}`);

      // Defer
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      await savePreferences(interaction.user.id, "user_choice_model_alias", selectedModelAlias);

      // Done
      await interaction.editReply({content: `Model set to: ${selectedModelAlias}`});
    }
  }
};
