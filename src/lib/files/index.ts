import { Files } from "files-sdk";
import { createFilesOptionsFromConfigFile } from "./supportedAdapters.js";

export const filesAdapter = new Files(await createFilesOptionsFromConfigFile());
