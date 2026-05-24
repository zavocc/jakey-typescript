import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SendableChannels } from "discord.js";

export function linkBtnAggregator(citations: Array<{ title: string; url: string }>): Array<ActionRowBuilder<ButtonBuilder>> {
  const ActionRows: Array<ActionRowBuilder<ButtonBuilder>> = [];

  // Remove duplicate citations
  const uniqueCitations = citations.filter((citation, index, self) =>
    // Obtain index of first occurrence of citation with matching URL
    index === self.findIndex((cite) => cite.url?.trim() === citation.url?.trim())
  );
  const buttons = uniqueCitations.map((citation) => {
    // Trim citation title to 80 characters and add ellipsis if necessary
    const cleanTitle = citation.title.length > 80 ? citation.title.slice(0, 77) + "..." : citation.title;

    return new ButtonBuilder()
      .setLabel(cleanTitle)
      .setStyle(ButtonStyle.Link)
      .setEmoji("🌐")
      .setURL(citation.url.trim());
  });

  const maxButtonsPerRow = 5;
  for (let idx = 0; idx < buttons.length; idx += maxButtonsPerRow) {
    // chunk and add sliding window of buttons to action rows
    const rowButtons = buttons.slice(idx, idx + maxButtonsPerRow);

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(rowButtons);

    ActionRows.push(row);
  }

  return ActionRows;
}

export function queryBtnAggregator(queries: Array<string>): Array<ActionRowBuilder<ButtonBuilder>>  {
  const ActionRows: Array<ActionRowBuilder<ButtonBuilder>> = [];

  const buttons = queries.map((query) => {
    const cleanQuery = query.trim();
    const label = cleanQuery.length > 80 ? cleanQuery.slice(0, 77) + "..." : cleanQuery;

    return new ButtonBuilder()
      .setLabel(label)
      .setStyle(ButtonStyle.Link)
      .setEmoji("🔍")
      .setURL(`https://google.com/search?q=${encodeURIComponent(cleanQuery)}`);
  });

  const maxButtonsPerRow = 5;
  for (let idx = 0; idx < buttons.length; idx += maxButtonsPerRow) {
    // chunk and add sliding window of buttons to action rows
    const rowButtons = buttons.slice(idx, idx + maxButtonsPerRow);

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(rowButtons);

    ActionRows.push(row);
  }

  return ActionRows;
}

export async function sendBtns(interactions: SendableChannels, queries?: Array<ActionRowBuilder<ButtonBuilder>>, links?: Array<ActionRowBuilder<ButtonBuilder>>) {
  if (!queries && !links) return;
  // Send queries
  if (queries) {
    // Iterate over queries, chunk to 5, send chunks each per message
    for (let i = 0; i < queries.length; i += 5) {
      const chunk = queries.slice(i, i + 5);
      await interactions.send({ components: chunk });
    }
  }
  // Send links
  if (links) {
    // Iterate over links, chunk to 5, send chunks each per message
    for (let i = 0; i < links.length; i += 5) {
      const chunk = links.slice(i, i + 5);
      await interactions.send({ components: chunk });
    }
  }
}
