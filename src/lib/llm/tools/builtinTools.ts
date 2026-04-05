// Compile tools here
import { THINK_TOOL_SCHEMA, think_tool } from "./builtins/think_tool";
import { FILE_WRITE_TOOL_SCHEMA, file_write } from "./builtins/file_write";
import { HAVE_A_BANANA_TOOL_SCHEMA, have_a_banana } from "./builtins/have_a_banana";

// TODO: To polish this soon
// Right now this is to test to see if tool use works

export const BUILTIN_TOOL_SCHEMAS = [
  THINK_TOOL_SCHEMA,
  FILE_WRITE_TOOL_SCHEMA,
  HAVE_A_BANANA_TOOL_SCHEMA
]

export const toolFunctions = {
  think_tool,
  file_write,
  have_a_banana
}