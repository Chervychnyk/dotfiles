/**
 * Auto Session Name Extension
 *
 * Automatically names sessions based on the first user message.
 * Cleans up the text by removing code blocks, URLs, excess whitespace,
 * and extracting a meaningful snippet.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

function cleanSessionName(text: string): string {
  let cleaned = text
    // Remove code blocks (```...```)
    .replace(/```[\s\S]*?```/g, "")
    // Remove inline code (`...`)
    .replace(/`[^`]+`/g, "")
    // Remove URLs
    .replace(/https?:\/\/\S+/g, "")
    // Remove file paths
    .replace(/(?:\/[\w.-]+){2,}/g, "")
    // Remove markdown headers
    .replace(/^#+\s*/gm, "")
    // Remove markdown emphasis
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    // Collapse whitespace and newlines
    .replace(/\s+/g, " ")
    .trim();

  // If cleaned text is too short after stripping, fall back to original
  if (cleaned.length < 5) {
    cleaned = text.replace(/\s+/g, " ").trim();
  }

  // Truncate at sentence boundary if possible, otherwise at word boundary
  if (cleaned.length > 60) {
    const sentenceEnd = cleaned.slice(0, 65).search(/[.!?]\s/);
    if (sentenceEnd > 15 && sentenceEnd <= 60) {
      cleaned = cleaned.slice(0, sentenceEnd + 1);
    } else {
      // Truncate at last word boundary before 60 chars
      const truncated = cleaned.slice(0, 60);
      const lastSpace = truncated.lastIndexOf(" ");
      cleaned = lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated;
    }
  }

  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}

export default function (pi: ExtensionAPI) {
  let named = false;

  pi.on("session_start", async (_event, ctx) => {
    named = !!pi.getSessionName();
  });

  pi.on("agent_end", async (event) => {
    if (named) return;
    const userMsg = event.messages.find((m) => m.role === "user");
    if (!userMsg) return;
    const text = typeof userMsg.content === "string"
      ? userMsg.content
      : userMsg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join(" ");
    if (!text) return;
    const name = cleanSessionName(text);
    if (name) {
      pi.setSessionName(name);
      named = true;
    }
  });
}
