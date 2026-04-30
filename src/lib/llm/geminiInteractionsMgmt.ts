import { GoogleClient } from "../../lib/llm/providerClients.js";

export async function DeleteGeminiInteractionID(intID: string, userId: string) {
  // Delete the interaction from Google AI Studio
  try {
    if (intID) {
      await GoogleClient.interactions.delete(intID);
    }
  } catch (error) {
    throw error;
  }

  // Get interactions ID, if it caught an exception, great!
  try {
    if (intID) {
      await GoogleClient.interactions.get(intID);
    }
  } catch (error) {
    console.log(`Successfully deleted interaction for user ${userId}.`);
  }
}
