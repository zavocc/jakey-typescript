// pulls preferences and other data from the database
import logger from "./pinoLogger.js";
import { z } from "zod";
import { PreferencesSchema } from "../types/schemas.js";
import { getDB } from "./services/mongodb/index.js";

const childLogger = logger.child({ module: "lib.preferencesDBLoader" });
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

  childLogger.debug({prefName: prefName, user_snowflake: userId}, "Successfully loaded preferences");
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

  // If null, remove the field from the document entirely
  if (data === null) {
    await collection.updateOne(
      { user_id: userId },
      { $unset: { [prefName]: "" } },
      { upsert: true }
    );
  } else {
    await collection.updateOne(
      { user_id: userId },
      { $set: { [prefName]: data } as Pick<Preferences, K> },
      { upsert: true }
    );
  }

  childLogger.debug({prefName: prefName, prefValue: data, user_snowflake: userId}, "Successfully saved preferences");
}

// reset user preferences
async function clearUserPreferences(userId: string): Promise<void> {
  const collection = await getPrefsCollection();
  await collection.deleteOne({ user_id: userId });
  childLogger.debug({user_snowflake: userId}, "Successfully cleared user preferences");
}

export { loadPreferences, savePreferences, clearUserPreferences };
