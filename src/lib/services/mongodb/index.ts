import logger from "../../pinoLogger.js";
import { MongoClient, type Db } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI ?? "");
const dbName = process.env.MONGODB_DB_NAME ?? "";
let isConnected = false;

const childLogger = logger.child({ module: "lib.services.mongodb" });

// connect to db
export async function startDB(): Promise<void> {
  if (isConnected) {
    return;
  }

  await client.connect();
  await client.db("admin").command({ ping: 1 });
  isConnected = true;
  childLogger.info("Connected to MongoDB!");
}

// return the client for performing db operations
export async function getDB(): Promise<Db> {
  if (!(client instanceof MongoClient)) {
    throw new Error("Invalid MongoDB client instance.");
  }

  if (!isConnected) {
    throw new Error("MongoDB client is not connected. Please call startDB() first.");
  }

  // check if we have MONGODB_DB_NAME in env
  if (!dbName) {
    throw new Error("Missing MONGODB_DB_NAME in environment variables.");
  }

  const dataBased = client.db(dbName);
  return dataBased;
}

// close
export async function stopDB(): Promise<void> {
  await client.close();
  isConnected = false;
  childLogger.info("MongoDB connection closed.");
}
