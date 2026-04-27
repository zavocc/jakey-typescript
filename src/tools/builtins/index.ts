// Compile tools here
import { FILE_WRITE_TOOL_SCHEMA, file_write } from "./file_write";
import { HAVE_A_BANANA_TOOL_SCHEMA, have_a_banana } from "./have_a_banana";
import { REACT_MESSAGE_TOOL_SCHEMA, react_message } from "./react_message";

export const BUILTIN_TOOL_SCHEMAS = [
  FILE_WRITE_TOOL_SCHEMA,
  HAVE_A_BANANA_TOOL_SCHEMA,
  REACT_MESSAGE_TOOL_SCHEMA,
]

export const BuiltInToolFunctions = {
  file_write,
  have_a_banana,
  react_message,
}