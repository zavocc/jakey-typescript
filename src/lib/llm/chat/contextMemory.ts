// functions to load and save to db
import { getDBClient } from '../../db/mongodb';
import type { ModelMessage } from 'ai';

// TODO: to be stored in config.json
const MONGODB_DB_NAME = 'jakeyv2db';
const MONGODB_COLLECTION_NAME = 'chat_contexts';

// TODO: FIX loading and saving, because I keep getting invalid input errors when sending ModelMessage context again

export async function loadContext(userId: string) {
  try {
    const db = await getDBClient();
    const collection = db.db(MONGODB_DB_NAME).collection(MONGODB_COLLECTION_NAME);
    const context = await collection.findOne({ userId });
    return context?.messages || [];
  } catch (error) {
    console.error(`Error parsing context for user ${userId}:`, error);
    throw new Error(`Failed to load context for user ${userId}.`);
  }
}

export async function saveContext(userId: string, context: ModelMessage[]): Promise<void> {
  try {
    const db = await getDBClient();
    const collection = db.db(MONGODB_DB_NAME).collection(MONGODB_COLLECTION_NAME);
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
