import { config } from "dotenv";

config();

const requiredRtVariables = [
  "DISCORD_TOKEN",
  "DISCORD_APP_ID",
  "MONGODB_URI",
  "MONGODB_DB_NAME",
  "TAVILY_API_KEY"
];

for (const variable of requiredRtVariables) {
  if (!process.env[variable]) {
    throw new Error(`Missing required environment variable: ${variable}`);
  }
}
