/**
 * UV Extension - Enforces uv-first Python tooling
 *
 * This extension does not replace the bash tool.
 * Instead, it:
 * - injects uv-first guidance into the system prompt
 * - blocks disallowed Python package/environment commands at tool-call time
 *
 * Blocked commands:
 * - pip / pip3
 * - poetry
 * - python -m pip
 * - python -m venv
 * - python -m py_compile
 *
 * Allowed raw python/python3 commands are not rewritten automatically,
 * but the agent is instructed to prefer `uv run ...` where practical.
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'

function getBlockedCommandMessage(command: string): string | null {
  // Match commands at the start of a shell segment (start/newline/; /&& /|| /|)
  const pipCommandPattern = /(?:^|\n|[;|&]{1,2})\s*(?:\S+\/)?pip\s*(?:$|\s)/m
  const pip3CommandPattern = /(?:^|\n|[;|&]{1,2})\s*(?:\S+\/)?pip3\s*(?:$|\s)/m
  const poetryCommandPattern =
    /(?:^|\n|[;|&]{1,2})\s*(?:\S+\/)?poetry\s*(?:$|\s)/m

  // Match python invocations including explicit paths like .venv/bin/python
  // and .venv/bin/python3.12.
  const pythonPipPattern =
    /(?:^|\n|[;|&]{1,2})\s*(?:\S+\/)?python(?:3(?:\.\d+)?)?\b[^\n;|&]*(?:\s-m\s*pip\b|\s-mpip\b)/m
  const pythonVenvPattern =
    /(?:^|\n|[;|&]{1,2})\s*(?:\S+\/)?python(?:3(?:\.\d+)?)?\b[^\n;|&]*(?:\s-m\s*venv\b|\s-mvenv\b)/m
  const pythonPyCompilePattern =
    /(?:^|\n|[;|&]{1,2})\s*(?:\S+\/)?python(?:3(?:\.\d+)?)?\b[^\n;|&]*(?:\s-m\s*py_compile\b|\s-mpy_compile\b)/m

  if (pipCommandPattern.test(command)) {
    return [
      'Error: pip is disabled. Use uv instead:',
      '',
      '  To install a package for a script: uv run --with PACKAGE python script.py',
      '  To add a dependency to the project: uv add PACKAGE',
      '',
    ].join('\n')
  }

  if (pip3CommandPattern.test(command)) {
    return [
      'Error: pip3 is disabled. Use uv instead:',
      '',
      '  To install a package for a script: uv run --with PACKAGE python script.py',
      '  To add a dependency to the project: uv add PACKAGE',
      '',
    ].join('\n')
  }

  if (poetryCommandPattern.test(command)) {
    return [
      'Error: poetry is disabled. Use uv instead:',
      '',
      '  To initialize a project: uv init',
      '  To add a dependency: uv add PACKAGE',
      '  To sync dependencies: uv sync',
      '  To run commands: uv run COMMAND',
      '',
    ].join('\n')
  }

  if (pythonPipPattern.test(command)) {
    return [
      "Error: 'python -m pip' is disabled. Use uv instead:",
      '',
      '  To install a package for a script: uv run --with PACKAGE python script.py',
      '  To add a dependency to the project: uv add PACKAGE',
      '',
    ].join('\n')
  }

  if (pythonVenvPattern.test(command)) {
    return [
      "Error: 'python -m venv' is disabled. Use uv instead:",
      '',
      '  To create a virtual environment: uv venv',
      '',
    ].join('\n')
  }

  if (pythonPyCompilePattern.test(command)) {
    return [
      "Error: 'python -m py_compile' is disabled because it writes .pyc files to __pycache__.",
      '',
      '  To verify syntax without bytecode output: uv run python -m ast path/to/file.py >/dev/null',
      '',
    ].join('\n')
  }

  return null
}

export default function (pi: ExtensionAPI) {
  pi.on('before_agent_start', async (event) => {
    const policy = `
## Python tooling policy

When working with Python tooling, prefer uv.

Use:
- \`uv add PACKAGE\` instead of \`pip install PACKAGE\`
- \`uv run ...\` instead of raw \`python\` / \`python3\` where practical
- \`uv venv\` instead of \`python -m venv\`
- \`uv sync\` instead of Poetry install/sync flows

Do not use:
- \`pip\`, \`pip3\`, or \`poetry\`
- \`python -m pip\`
- \`python -m venv\`
- \`python -m py_compile\`
`

    return {
      systemPrompt: `${event.systemPrompt}\n\n${policy}`,
    }
  })

  pi.on('tool_call', async (event) => {
    if (event.toolName !== 'bash') return

    const input = event.input as { command?: unknown } | undefined
    const command = typeof input?.command === 'string' ? input.command : ''
    const blockedMessage = getBlockedCommandMessage(command)
    if (!blockedMessage) return

    return {
      block: true,
      reason: blockedMessage,
    }
  })
}
