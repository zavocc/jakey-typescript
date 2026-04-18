// functions to load and save to db
import { getDB } from '../../services/mongodb';
import { GoogleClient } from '../providerClients';
const MONGODB_COLLECTION_NAME = 'interactionID';

async function getContextCollection() {
  const db = await getDB();
  return db.collection(MONGODB_COLLECTION_NAME);
}

export async function loadContext(userId: string): Promise<string | null> {
  try {
    const collection = await getContextCollection();
    const context = await collection.findOne({ userId });
    return context?.interaction_id;
  } catch (error) {
    console.error(`Error parsing context for user ${userId}:`, error);
    throw new Error(`Failed to load context for user ${userId}.`);
  }
}

export async function saveContext(userId: string, interactionID: string): Promise<void> {
  try {
    const collection = await getContextCollection();
    await collection.updateOne(
      { userId },
      { $set: { interaction_id: interactionID } },
      { upsert: true }
    );
  } catch (error) {
    console.error(`Error saving context for user ${userId}:`, error);
    throw new Error(`Failed to save context for user ${userId}.`);
  }
}

export async function clearContext(userId: string): Promise<void> {
  const collection = await getContextCollection();

  // First, obtain the interaction ID
  const context = await loadContext(userId);

  // Delete the interaction from Google AI Studio
  try {
    if (context) {
      await GoogleClient.interactions.delete(context);
    }
  } catch (error) {
    console.error(`Error deleting interaction for user ${userId}:`, error);
  } finally {
    // Delete the interaction from db
    await collection.deleteOne({ userId });
  }
}
