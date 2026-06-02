import pino, { type Logger } from "pino";
import path from "node:path";
import { fileURLToPath } from "node:url";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
    }
  }
});

// Get the path of "src" directory, currently in "src/lib" when this module is called
const sourceRoot = fileURLToPath(new URL("../", import.meta.url));

export function createModuleLogger(moduleUrl: string, moduleName?: string): Logger {
  if (moduleName !== undefined) {
    return logger.child({ module: moduleName });
  }

  // get relative module path so the source root directory so it's easier to read and parse than stating the full path
  const relativeModulePath = path.relative(sourceRoot, fileURLToPath(moduleUrl));
  // get the dir and name of the relative module path from src
  const parsedModulePath = path.parse(relativeModulePath);
  const modulePath = path.join(parsedModulePath.dir, parsedModulePath.name);

  // replace slashes into dots
  return logger.child({ module: modulePath.split(path.sep).join(".") });
}

export default logger;
