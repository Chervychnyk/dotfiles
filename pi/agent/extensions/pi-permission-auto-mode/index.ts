import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createAutoModeExtension } from "./src/extension.js";

export default function autoMode(pi: ExtensionAPI): void {
  createAutoModeExtension(pi, {
    configUrl: new URL("./config.json", import.meta.url),
  });
}
