import { getConfigJsonKeySync } from "../../configuratorJSON";
import { MongoClient, type Db } from "mongodb";

const client = new MongoClient(getConfigJsonKeySync("db")?.mongodb ?? "");
const db = getConfigJsonKeySync("db") ?? { mongodb_db_name: "" };
let isConnected = false;

// ensure indexes exist for query performance
async function ensureIndexes(): Promise<void> {
  const database = client.db(db.mongodb_db_name);

  // check if the collection is empty before creating an index
  const userPrefs = database.collection("discord_user_preferences");
  if ((await userPrefs.countDocuments({}, { limit: 1 })) === 0) {
    await userPrefs.createIndex({ user_id: 1 }, { unique: true });
    console.log("[DB] Created index for discord_user_preferences");
  }

  const chatContexts = database.collection("chat_contexts");
  if ((await chatContexts.countDocuments({}, { limit: 1 })) === 0) {
    await chatContexts.createIndex({ userId: 1 }, { unique: true });
    console.log("[DB] Created index for chat_contexts");
  }

  console.log("MongoDB indexes initialized.");
}

// connect to db
export async function startDB(): Promise<void> {
  if (isConnected) {
    return;
  }

  await client.connect();
  await client.db("admin").command({ ping: 1 });
  await ensureIndexes();
  isConnected = true;
  console.log("Connected to MongoDB!");
}

// return the client for performing db operations
export async function getDB(): Promise<Db> {
  if (!(client instanceof MongoClient)) {
    throw new Error("Invalid MongoDB client instance.");
  }

  if (!isConnected) {
    throw new Error("MongoDB client is not connected. Please call startDB() first.");
  }

  // check if we have db.mongodb_db_name in config
  if (!db.mongodb_db_name) {
    throw new Error("Missing 'mongodb_db_name' in config.json.");
  }

  const dataBased = client.db(db.mongodb_db_name);
  return dataBased;
}

// close
export async function stopDB(): Promise<void> {
  await client.close();
  isConnected = false;
  console.log("MongoDB connection closed.");
}
