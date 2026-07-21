# Dotfiles Pi Config

Language for the Pi agent configuration managed by this dotfiles repo.

## Language

**Pi runtime**:
The configured Pi agent environment restored by this repo, including packages, model defaults, local extensions, custom agents, themes, and related settings.
_Avoid_: Pi setup, agent setup

**Safety stack**:
The set of modules that deny, prompt, or advise around risky Pi tool use.
_Avoid_: security layer

**Sandbox policy**:
The filesystem and network rules enforced before Pi tool execution.
_Avoid_: sandbox config, allowlist

**Custom agent**:
A role-specific agent definition under `pi/agent/agents`.
_Avoid_: subagent prompt, agent persona

**Extension settings**:
Tiered global, project, and local settings loaded by local Pi extensions.
_Avoid_: extension config, plugin config
