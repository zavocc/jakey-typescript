import { MongoClient } from "mongodb";
import { db } from "../../../config.json";

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(db.mongodb);
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
export async function getDBClient(): Promise<MongoClient> {
  if (!(client instanceof MongoClient)) {
    throw new Error("Invalid MongoDB client instance.");
  }

  if (!isConnected) {
    throw new Error("MongoDB client is not connected. Please call startDB() first.");
  }

  return client;
}

// close
export async function stopDB(): Promise<void> {
  await client.close();
  isConnected = false;
  console.log("MongoDB connection closed.");
}
