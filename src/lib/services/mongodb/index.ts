import { getConfigJsonKeySync } from "../../configuratorJSON.js";
import { MongoClient, type Db } from "mongodb";

const client = new MongoClient(getConfigJsonKeySync("db")?.mongodb ?? "");
const db = getConfigJsonKeySync("db") ?? { mongodb_db_name: "" };
let isConnected = false;

// connect to db
export async function startDB(): Promise<void> {
  if (isConnected) {
    return;
  }

  await client.connect();
  await client.db("admin").command({ ping: 1 });
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
