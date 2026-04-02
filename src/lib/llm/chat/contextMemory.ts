// functions to load and save to db
import { getDB } from '../../services/db/mongodb';
const MONGODB_COLLECTION_NAME = 'chat_contexts';

async function getContextCollection() {
  const db = await getDB();
  return db.collection(MONGODB_COLLECTION_NAME);
}

export async function loadContext(userId: string) {
  try {
    const collection = await getContextCollection();
    const context = await collection.findOne({ userId });
    return context?.messages || [];
  } catch (error) {
    console.error(`Error parsing context for user ${userId}:`, error);
    throw new Error(`Failed to load context for user ${userId}.`);
  }
}

export async function saveContext(userId: string, context: Array<any>): Promise<void> {
  try {
    const collection = await getContextCollection();
    await collection.updateOne(
      { userId },
      { $set: { messages: context } },
      { upsert: true }
    );
  } catch (error) {
    console.error(`Error saving context for user ${userId}:`, error);
    throw new Error(`Failed to save context for user ${userId}.`);
  }
}

export async function clearContext(userId: string): Promise<void> {
  const collection = await getContextCollection();
  await collection.deleteOne({ userId });
}

