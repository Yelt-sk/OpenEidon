/**
 * OpenJarvis Claude Code Runner
 *
 * Reads a JSON request from stdin, invokes the Claude Agent SDK,
 * and writes sentinel-wrapped JSON output to stdout.
 *
 * Input (JSON on stdin):
 *   { prompt, api_key, workspace, allowed_tools, system_prompt, session_id }
 *
 * Output (on stdout, between sentinels):
 *   ---OPENJARVIS_OUTPUT_START---
 *   { content, tool_results, metadata }
 *   ---OPENJARVIS_OUTPUT_END---
 */

import { query, type Tool } from "@anthropic-ai/claude-code";

const OUTPUT_START = "---OPENJARVIS_OUTPUT_START---";
const OUTPUT_END = "---OPENJARVIS_OUTPUT_END---";

interface RunnerRequest {
  prompt: string;
  api_key: string;
  workspace: string;
  allowed_tools: string[];
  system_prompt: string;
  session_id: string;
}

interface ToolResultEntry {
  tool_name: string;
  content: string;
  success: boolean;
}

interface RunnerResponse {
  content: string;
  tool_results: ToolResultEntry[];
  metadata: Record<string, unknown>;
}

function emitResult(response: RunnerResponse): void {
  console.log(OUTPUT_START);
  console.log(JSON.stringify(response));
  console.log(OUTPUT_END);
}

function emitError(message: string): void {
  emitResult({
    content: message,
    tool_results: [],
    metadata: { error: true },
  });
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk: string) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      resolve(data);
    });
    process.stdin.on("error", (err: Error) => {
      reject(err);
    });
  });
}

async function main(): Promise<void> {
  let request: RunnerRequest;

  try {
    const raw = await readStdin();
    request = JSON.parse(raw) as RunnerRequest;
  } catch (err) {
    emitError(`Failed to parse input: ${err}`);
    process.exit(1);
  }

  // Set the API key in the environment for the SDK
  if (request.api_key) {
    process.env.ANTHROPIC_API_KEY = request.api_key;
  }

  try {
    // Build options for the claude-code SDK query
    const options: Parameters<typeof query>[0] = {
      prompt: request.prompt,
      options: {
        maxTurns: 30,
      },
    };

    if (request.workspace) {
      options.options!.cwd = request.workspace;
    }

    if (request.system_prompt) {
      options.options!.systemPrompt = request.system_prompt;
    }

    if (request.allowed_tools && request.allowed_tools.length > 0) {
      options.options!.allowedTools = request.allowed_tools as Tool[];
    }

    if (request.session_id) {
      options.options!.sessionId = request.session_id;
    }

    // Execute the query
    const messages = await query(options);

    // Extract the final assistant text and any tool results
    let content = "";
    const toolResults: ToolResultEntry[] = [];

    for (const msg of messages) {
      if (msg.type === "text") {
        content = msg.text;
      } else if (msg.type === "tool_use") {
        toolResults.push({
          tool_name: msg.name,
          content: JSON.stringify(msg.input),
          success: true,
        });
      } else if (msg.type === "tool_result") {
        // Update last tool result with actual output
        if (toolResults.length > 0) {
          const last = toolResults[toolResults.length - 1];
          last.content =
            typeof msg.content === "string"
              ? msg.content
              : JSON.stringify(msg.content);
          last.success = !msg.is_error;
        }
      }
    }

    emitResult({
      content,
      tool_results: toolResults,
      metadata: {
        message_count: messages.length,
        session_id: request.session_id || undefined,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emitError(`Claude Code SDK error: ${message}`);
    process.exit(1);
  }
}

main();
