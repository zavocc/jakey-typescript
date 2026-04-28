import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  Collection,
  MessageContextMenuCommandInteraction,
} from "discord.js";

type BotCommandInteraction =
  | ChatInputCommandInteraction
  | MessageContextMenuCommandInteraction;

type BotCommand = {
  data: { name: string };
  execute: (interaction: BotCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
};

// This tells TypeScript that Client extends with a `commands` property of type `Collection<string, BotCommand>`
// As just typing client.commands alone would cause lint errors, so we tell typescript Client extends with this property
declare module "discord.js" {
  interface Client {
    commands: Collection<string, BotCommand>;
  }
}
