// functions to load and save to db
import { getDB } from '../../services/mongodb';
const MONGODB_COLLECTION_NAME = 'chat_contexts';
const DEFAULT_THREAD_NAME = 'default';

async function getContextCollection() {
  const db = await getDB();
  return db.collection(MONGODB_COLLECTION_NAME);
}

export async function loadContext(userId: string, threadName?: string) {
  try {
    const collection = await getContextCollection();
    const context = await collection.findOne({ userId });
    return context?.messages?.[threadName || DEFAULT_THREAD_NAME] ?? [];
  } catch (error) {
    console.error(`Error parsing context for user ${userId}:`, error);
    throw new Error(`Failed to load context for user ${userId}.`);
  }
}

export async function saveContext(userId: string, context: Array<any>, threadName?: string): Promise<void> {
  try {
    const collection = await getContextCollection();
    await collection.updateOne(
      { userId },
      // NOTE: while in javascript it may appear as object key with dot, in mongodb it will be treated as nested object, which is what we want
      { $set: { [`messages.${threadName || DEFAULT_THREAD_NAME}`]: context } },
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
