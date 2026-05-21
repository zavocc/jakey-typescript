import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { SendableChannels } from 'discord.js';

/**
 * Group buttons into Action Rows of up to 5 buttons each.
 */
function groupButtons(buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder>[] {
  const actionRows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    const rowButtons = buttons.slice(i, i + 5);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(rowButtons);
    actionRows.push(row);
  }
  return actionRows;
}

/**
 * Helper to generate a list of ButtonBuilders from a unique citations URL-to-Title Map.
 */
function createButtonsFromMap(citationsMap: Map<string, string>): ButtonBuilder[] {
  const buttonsList: ButtonBuilder[] = [];
  const resolved: Array<{ url: string; label: string }> = [];
  const labelCounts = new Map<string, number>();

  for (const [url, title] of citationsMap.entries()) {
    let label = title.trim();
    if (!label) {
      try {
        const parsedUrl = new URL(url);
        // Strip leading 'www.' for a cleaner presentation
        label = parsedUrl.hostname.replace(/^www\./, '');
      } catch {
        label = 'Source';
      }
    }
    if (!label) {
      label = 'Source';
    }
    if (label.length > 70) {
      label = label.slice(0, 67) + '...';
    }

    resolved.push({ url, label });
    labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
  }

  const labelIndices = new Map<string, number>();
  for (const item of resolved) {
    let finalLabel = item.label;
    const count = labelCounts.get(item.label) || 1;
    if (count > 1) {
      const nextIndex = (labelIndices.get(item.label) || 0) + 1;
      labelIndices.set(item.label, nextIndex);
      finalLabel = `${item.label} [${nextIndex}]`;
    }

    buttonsList.push(
      new ButtonBuilder()
        .setLabel(finalLabel)
        .setURL(item.url)
        .setStyle(ButtonStyle.Link)
        .setEmoji('🌐')
    );
  }
  return buttonsList;
}

/**
 * Parses directly cited sources and renders them as Discord link buttons.
 */
export async function citationBtnViewer(
  citedCitations: Map<string, string>,
  messageChannel: SendableChannels,
): Promise<void> {
  const citedButtons = createButtonsFromMap(citedCitations);

  // If there are no sources at all, do nothing
  if (citedButtons.length === 0) {
    return;
  }

  const actionRows = groupButtons(citedButtons);
  if (actionRows.length > 0) {
    await messageChannel.send({
      components: actionRows.slice(0, 5),
    });
  }
}

/**
 * Generates Discord link buttons for Google Search queries that land on the Google.com Search Results Page (SRP),
 * and sends them in a row below the sources list.
 */
export async function querySrp(
  queries: Set<string> | string[],
  messageChannel: SendableChannels,
): Promise<void> {
  const queryArray = Array.from(queries);
  if (queryArray.length === 0) return;

  const buttons: ButtonBuilder[] = [];
  for (const query of queryArray) {
    const trimmed = query.trim();
    if (!trimmed) continue;

    // Discord button labels are limited to 80 characters
    let label = trimmed;
    if (label.length > 70) {
      label = label.slice(0, 67) + '...';
    }

    const srpUrl = `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;

    buttons.push(
      new ButtonBuilder()
        .setLabel(label)
        .setURL(srpUrl)
        .setStyle(ButtonStyle.Link)
        .setEmoji('🔍')
    );
  }

  const actionRows = groupButtons(buttons);
  if (actionRows.length > 0) {
    await messageChannel.send({
      components: actionRows.slice(0, 5),
    });
  }
}
