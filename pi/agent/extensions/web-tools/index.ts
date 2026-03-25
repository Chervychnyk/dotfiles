import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { registerWebFetchTool } from './web-fetch.ts'
import { registerWebSearchTool } from './web-search.ts'

export default function webToolsExtension(pi: ExtensionAPI) {
  registerWebSearchTool(pi)
  registerWebFetchTool(pi)
}
