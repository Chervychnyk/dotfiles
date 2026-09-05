# Pi sandbox alternatives

Research checked 2026-08-25. Sources are project repositories, package metadata, and upstream documentation only. The pi.dev page could not be fetched from this environment because its network policy rejected the request, so I treat it only as the catalog entry for the npm package and verify package claims against npm and the linked repository.

## Recommendation

For macOS, [NAV's `cplt`](https://github.com/navikt/cplt) is the strongest maintained option I found. It is not a Pi extension. It wraps the whole Pi process, which is a better security boundary than replacing only Pi's `bash` tool. Its macOS profile covers filesystem access, execution, environment variables, sockets, and outbound ports. Its optional CONNECT proxy adds domain filtering. It also has a startup summary and confirmation, repository-policy trust flow, diagnostics, and extensive tests. The cost is more setup and a separate launcher: `cplt --agent pi --pass-env ANTHROPIC_API_KEY` rather than plain `pi`.

If native Pi integration and one-command installation matter more, [`@nqbao/pi-sandbox`](https://github.com/nqbao/pi-sandbox) is the best of the Pi packages compared here. It covers Pi's bash tool, user-entered shell commands, and the built-in file tools. It is materially more complete than Pi's example, but its network switch is only allow-all or deny-all rather than a domain policy, and it has no per-operation approval prompt.

Do not choose [`brownag/pi-sandbox`](https://github.com/brownag/pi-sandbox) on macOS. It is Linux-only. Pi's upstream example is useful reference code, not a polished package.

## Comparison

| Option | macOS | Filesystem isolation | Network isolation | Approval UX | Tool coverage | Maintenance signal | Install friction |
|---|---|---|---|---|---|---|---|
| [`pi.dev` catalog entry for `pi-sandbox`](https://pi.dev/packages/pi-sandbox) | Same as nqbao package | Same as nqbao package | Same as nqbao package | Same as nqbao package | Same as nqbao package | Catalog entry, not a separate implementation | One Pi package install |
| [`nqbao/pi-sandbox`](https://github.com/nqbao/pi-sandbox) | Yes, `sandbox-exec` | OS policy for shell children plus in-process guards for Pi file tools; writable roots, read denies, nested denies, read-only mode | Boolean on/off at OS policy level; no domain allowlist | Status and enable/disable/reset commands; no per-call approval | `bash`, user bash, `write`, `edit`, `read`, `grep`, `find`, `ls`; anticipates move/delete | npm 0.1.3 points to commit `6f8f548`; several commits and tests, one maintainer | `pi install npm:@nqbao/pi-sandbox`, then optional JSON config |
| [`brownag/pi-sandbox`](https://github.com/brownag/pi-sandbox) | No | Bubblewrap mount namespace. Host paths are mostly absent or read-only; workspace and `~/.pi/agent` are writable | None. The script does not unshare the network namespace or filter egress | None | Whole Pi process, so all in-process and child-process access is subject to mounts | One initial commit; tiny shell wrapper; no release/package/test suite | Install `bwrap`, copy and chmod a script, invoke wrapper with `-w` |
| [Pi upstream sandbox example](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/sandbox) | Yes, through Anthropic sandbox runtime | Shell subprocesses only. Default deny-read and deny-write patterns; direct Pi file tools are not intercepted | Domain allowlist through `@anthropic-ai/sandbox-runtime` | Startup notification, status command, `--no-sandbox`; no per-call approval | Replaces `bash` and handles user bash only | Maintained with Pi, but explicitly an example; pinned runtime dependency | Copy directory and run npm install; Linux also needs `bubblewrap`, `socat`, and `ripgrep` |
| [`navikt/cplt`](https://github.com/navikt/cplt) | Yes, Apple Silicon and Intel releases | Deny-by-default Seatbelt profile around the entire Pi process; project-scoped writes; sensitive paths, git persistence paths, temp execution, sockets, and environment handled separately | Port 443 only by default; localhost blocked; optional CONNECT proxy supports allowed/blocked domains and forced proxy routing | Startup configuration summary and confirmation; `--yes` for automation; content-pinned trust for repo proposals; interactive settings; doctor and denial log | Whole Pi process and every child process, independent of Pi tool registration | Active organizational repo, frequent binary releases, broad automated security documentation/tests, 100+ stars at check time | Download one static binary, select Pi explicitly, opt API keys into environment; more policy knobs to learn |

## Notes on each option

### pi.dev and nqbao are one option, not two

The pi.dev result appears to be the discovery page for `@nqbao/pi-sandbox`, not another implementation. The [npm registry record](https://registry.npmjs.org/@nqbao%2fpi-sandbox/latest) names `nqbao/pi-sandbox` as its repository and exposes `./index.ts` as the Pi extension. At the time checked, npm reported version 0.1.3 and git head [`6f8f548`](https://github.com/nqbao/pi-sandbox/commit/6f8f5484c4654e0b86730c0d56a81633a8473ea8).

On macOS, the extension generates a `sandbox-exec` policy for shell commands. On Linux it uses Bubblewrap. It fails closed when enabled and no provider exists. Its [README](https://github.com/nqbao/pi-sandbox/blob/main/README.md) documents default read denies for SSH, AWS, GnuPG, gcloud, netrc, git credentials, `/etc/shadow`, and `/etc/sudoers`; workspace, temp, and Pi's agent directory are writable by default. `.git/hooks` remains denied within the writable workspace.

Its useful distinction from Pi's example is coverage of in-process tools. The [extension source](https://github.com/nqbao/pi-sandbox/blob/main/index.ts) installs `tool_call` guards for Pi's read and write tools instead of assuming that a sandboxed shell covers them. Those guards are policy checks in JavaScript, while shell children get OS enforcement. There is no interactive approval request when an operation crosses the policy. Pi simply blocks it and reports why.

Network control is coarse. The [configuration schema described in the README](https://github.com/nqbao/pi-sandbox#configuration) has a boolean `network`, so it cannot allow GitHub and npm while denying arbitrary HTTPS destinations. That is the largest security gap compared with the upstream example's domain allowlist or cplt's proxy.

### brownag/pi-sandbox

This is a straightforward Bubblewrap launcher. The [script](https://github.com/brownag/pi-sandbox/blob/main/pi-sandbox.sh) mounts `/usr` and `/etc` read-only, creates private `/tmp`, `/proc`, and `/dev`, mounts the chosen workspace read-write at `/workspace`, and gives `~/.pi/agent` a writable hole inside a read-only `~/.pi`. Other home directories are not mounted.

That boundary covers the whole Pi process, which is good. The implementation is still too narrow for this use case. It has no macOS path, no network restriction, no secret-specific policy beyond mount visibility, and no approval or status interface. The [repository history](https://github.com/brownag/pi-sandbox/commits/main/) contains one initial commit. Its README also suggests setting Bubblewrap SUID on hardened Linux systems, an installation step worth reviewing carefully rather than applying casually.

### Pi's upstream example

Pi's [example source](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/sandbox/index.ts) wraps `bash` and user-entered shell commands with [`@anthropic-ai/sandbox-runtime`](https://github.com/anthropic-experimental/sandbox-runtime). It supports macOS and Linux, filesystem deny/allow rules, and domain allowlists. Defaults permit common npm, PyPI, and GitHub domains and deny reads of SSH, AWS, and GnuPG material.

The important limitation is architectural. Pi's `read`, `write`, and `edit` tools run in the Pi process rather than under the wrapped shell command, and this example does not install `tool_call` guards for them. It demonstrates replacing a built-in tool. It does not claim to sandbox every Pi capability. It also disables sandboxing after initialization errors rather than terminating Pi, according to the source's `session_start` error path. That makes it a poor fail-closed production default.

Installation is manual. The source comments instruct users to copy the directory into Pi extensions and install its npm dependency. The example's [`package.json`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/sandbox/package.json) marks it private, confirming that it is not distributed as a supported package.

### cplt, the stronger option

[`navikt/cplt`](https://github.com/navikt/cplt) explicitly supports Pi on macOS and Linux. Its [security model](https://github.com/navikt/cplt/blob/main/SECURITY.md) treats the agent as untrusted and wraps the complete process. On macOS it uses Seatbelt through `sandbox-exec`. It denies reads outside approved paths, restricts write and executable mappings, clears the inherited environment, blocks SSH-agent and localhost access by default, and restricts outbound ports. Pi's own tools and extension tools inherit that boundary because they run inside the wrapped process.

The network design is stronger than the Pi extensions. Port 443 is allowed by default, and the built-in CONNECT proxy can filter by domain, log connections, and operate in allowlist mode. Forced-proxy mode pins macOS egress to the local proxy. The project is candid that TLS contents remain opaque and allowed destinations remain capable of receiving data. See the [proxy documentation](https://github.com/navikt/cplt/blob/main/docs/proxy.md) and [security limitations](https://github.com/navikt/cplt/blob/main/SECURITY.md#platform-enforcement-comparison).

Its approval experience is policy-oriented rather than a prompt before each tool call. The [README configuration section](https://github.com/navikt/cplt#configuration) documents an initial summary and confirmation, `--yes` for noninteractive runs, an interactive settings editor, and `.cplt.toml` proposals that require `cplt trust accept`. Repository denials apply automatically, while requested permission increases need content-pinned approval. This avoids repeated prompts but gives less granularity than a true per-command approval system.

For Pi, API keys are not inherited unless explicitly named with `--pass-env`; Keychain access is disabled; `~/.pi` is writable for state; and `~/.pi/agent/bin` is executable but write-denied. Those Pi-specific adaptations are documented in [SECURITY.md](https://github.com/navikt/cplt/blob/main/SECURITY.md#pi-specific-security-notes).

Install friction is reasonable for the stronger boundary. The [release page](https://github.com/navikt/cplt/releases) publishes static binaries for Apple Silicon and Intel macOS with SHA-256 sums. Pi must be selected explicitly because its binary name is ambiguous. cplt is a wrapper, so existing aliases, session launchers, and extension assumptions may need adjustment.

## Bottom line

1. Use `cplt` when macOS isolation and network control are the priority. It has the broadest boundary, the clearest threat model, and the best maintenance evidence.
2. Use `@nqbao/pi-sandbox` when staying inside Pi's package system matters. It covers the built-in file tools, unlike upstream's example, but accept boolean-only network policy and no approval prompts.
3. Keep Pi's upstream example as reference material or a starting point for a custom extension, not as a turnkey security control.
4. Exclude `brownag/pi-sandbox` for macOS and for any workflow that needs egress controls.
