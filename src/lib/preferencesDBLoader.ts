// pulls preferences and other data from the database
import { z } from "zod";
import { PreferencesSchema } from "../types/schemas";
import { getDB } from "./services/mongodb";

const MONGODB_COLLECTION_NAME = "discord_user_preferences";
type Preferences = z.infer<typeof PreferencesSchema>;
type PreferenceKey = keyof Preferences;

function isPreferenceKey(prefName: string): prefName is PreferenceKey {
  return Object.prototype.hasOwnProperty.call(PreferencesSchema.shape, prefName);
}

async function getPrefsCollection() {
  const db = await getDB();
  return db.collection(MONGODB_COLLECTION_NAME);
}

async function loadPreferences<K extends PreferenceKey>(userId: string, prefName: K): Promise<Preferences[K] | null> {
  // Defensive check in case key comes from unchecked/casted input
  if (!isPreferenceKey(prefName)) {
    throw new Error(`Invalid preference name: ${prefName}`);
  }

  const collection = await getPrefsCollection();
  const result = await collection.findOne({ user_id: userId });

  // if none, we can return null
  if (!result) {
    return null;
  }

  return (result[prefName] ?? null) as Preferences[K] | null;
}

// extend from PreferenceKey so typescript won't complain
async function savePreferences<K extends PreferenceKey>(userId: string, prefName: K, data: Preferences[K]): Promise<void> {
  // Defensive check in case key comes from unchecked/casted input
  if (!isPreferenceKey(prefName)) {
    throw new Error(`Invalid preference name: ${prefName}`);
  }
  const validationResult = PreferencesSchema.shape[prefName].safeParse(data);

  if (!validationResult.success) {
    throw new Error(`Invalid data for preference '${prefName}': ${validationResult.error.message}`);
  }

  const collection = await getPrefsCollection();
  const update = { [prefName]: data } as Pick<Preferences, K>;
  await collection.updateOne(
    { user_id: userId },
    { $set: update },
    { upsert: true }
  );
}

// reset user preferences
async function clearUserPreferences(userId: string): Promise<void> {
  const collection = await getPrefsCollection();
  await collection.deleteOne({ user_id: userId });
}

export { loadPreferences, savePreferences, clearUserPreferences };
