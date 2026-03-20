/**
 * Permissions extension
 *
 * Enforces tool permissions from JSON rules, e.g. ~/.pi/agent/permissions.json
 * or split files under ~/.pi/agent/permissions.d/*.json
 * in this shape:
 *
 * [
 *   {
 *     "tool": "bash",
 *     "matches": { "cmd": ["*git push --force*", "*git push -f*"] },
 *     "action": "reject",
 *     "message": "Never force push."
 *   },
 *   { "tool": "*", "action": "allow" }
 * ]
 *
 * Supported:
 * - tool: exact tool name or "*" (case-insensitive)
 * - matches.cmd: string | string[] for bash command matching
 * - matches.path: string | string[] for read/write/edit path matching
 * - action: allow | ask | reject
 * - message: optional custom reject/ask message
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// =============================================================================
// Types
// =============================================================================

type PermissionAction = "allow" | "ask" | "reject";
type NotifyLevel = "info" | "warning" | "error";

type PatternInput = string | string[] | undefined;

type RawRuleObject = {
  tool?: unknown;
  matches?: unknown;
  action?: unknown;
  message?: unknown;
};

type RuleBase = {
  action: PermissionAction;
  message?: string;
  sourcePath: string;
  sourceIndex: number;
};

type PatternMatcher = {
  raw: string;
  test: (value: string) => boolean;
};

type BashRule = RuleBase & {
  kind: "bash";
  cmdMatchers?: PatternMatcher[];
};

type FileRule = RuleBase & {
  kind: "read" | "write" | "edit";
  pathMatchers?: PatternMatcher[];
};

type WildcardRule = RuleBase & {
  kind: "wildcard";
  cmdMatchers?: PatternMatcher[];
  pathMatchers?: PatternMatcher[];
};

type NamedToolRule = RuleBase & {
  kind: "tool";
  tool: string;
};

type CompiledRule = BashRule | FileRule | WildcardRule | NamedToolRule;

interface LoadedRules {
  path: string;
  rules: CompiledRule[];
}

interface ValidateFileReport {
  exists: boolean;
  rulesCount: number;
  issues: string[];
}

interface PermissionEventInput {
  toolName: string;
  command: string;
  targetPath: string;
}

interface CachedRulesEntry {
  mtimeMs: number;
  size: number;
  rules: CompiledRule[] | null;
}

// =============================================================================
// Defaults
// =============================================================================

const BASE_BASH_RULES_RAW: unknown[] = [
  {
    tool: "bash",
    matches: { cmd: ["*git add -A*", "*git add .*"] },
    action: "reject",
    message: "Stage files explicitly with 'git add <file>' — unstaged changes may not be yours.",
  },
  {
    tool: "bash",
    matches: { cmd: ["*git push --force*", "*git push -f*", "*--force-with-lease*"] },
    action: "reject",
    message: "Never force push. If diverged: 'git fetch origin && git rebase origin/main && git push'.",
  },
  {
    tool: "bash",
    matches: { cmd: ["rm *", "* && rm *", "* || rm *", "* ; rm *"] },
    action: "reject",
    message: "Use 'trash <file>' instead of rm wildcard deletion.",
  },

  // Reused from the original permissions extension built-in defaults.
  { tool: "bash", action: "ask", matches: { cmd: "*git*push*" } },
  {
    tool: "bash",
    matches: {
      cmd: [
        "ls", "ls *", "dir", "dir *", "cat *", "head *", "tail *", "less *", "more *",
        "grep *", "egrep *", "fgrep *", "tree", "tree *", "file *", "wc *", "pwd",
        "stat *", "du *", "df *", "ps *", "top", "htop", "echo *", "printenv *", "id",
        "which *", "whereis *", "date", "cal *", "uptime", "free *", "ping *", "dig *",
        "nslookup *", "host *", "netstat *", "ss *", "lsof *", "ifconfig *", "ip *",
        "man *", "info *", "mkdir *", "touch *", "uname *", "whoami",
        "go version", "go env *", "go help *",
        "cargo version", "cargo --version", "cargo help *",
        "rustc --version", "rustc --help", "rustc --explain *",
        "javac --version", "javac -version", "javac -help", "javac --help",
        "dotnet --info", "dotnet --version", "dotnet --help", "dotnet help *",
        "gcc --version", "gcc -v", "gcc --help", "gcc -dumpversion",
        "g++ --version", "g++ -v", "g++ --help", "g++ -dumpversion",
        "clang --version", "clang --help", "clang++ --version", "clang++ --help",
        "python -V", "python --version", "python -h", "python --help",
        "python3 -V", "python3 --version", "python3 -h", "python3 --help",
        "ruby -v", "ruby --version", "ruby -h", "ruby --help",
        "node -v", "node --version", "node -h", "node --help",
        "npm --help", "npm --version", "npm -v", "npm help *",
        "yarn --help", "yarn --version", "yarn -v", "yarn help *",
        "pnpm --help", "pnpm --version", "pnpm -v", "pnpm help *",
        "pytest -h", "pytest --help", "pytest --version",
        "jest --help", "jest --version", "mocha --help", "mocha --version",
        "make --version", "make --help",
        "docker --version", "docker --help", "docker version", "docker help *",
        "git --version", "git --help", "git help *", "git version",
      ],
    },
    action: "allow",
  },
  {
    tool: "bash",
    matches: {
      cmd: [
        "go test *", "go run *", "go build *", "go vet *", "go fmt *", "go list *",
        "cargo test *", "cargo run *", "cargo build *", "cargo check *", "cargo fmt *", "cargo tree *",
        "make -n *", "make --dry-run *",
        "mvn test *", "mvn verify *", "mvn dependency:tree *",
        "gradle tasks *", "gradle dependencies *", "gradle properties *",
        "dotnet test *", "dotnet list *",
        "python -c *", "ruby -e *", "node -e *",
        "npm list *", "npm ls *", "npm outdated *", "npm test*", "npm run*", "npm view *", "npm info *",
        "yarn list*", "yarn ls *", "yarn info *", "yarn test*", "yarn run *", "yarn why *",
        "pnpm list*", "pnpm ls *", "pnpm outdated *", "pnpm test*", "pnpm run *",
        "pytest --collect-only *", "jest --listTests *", "jest --showConfig *", "mocha --list *",
        "git status*", "git show *", "git diff*", "git grep *", "git branch *", "git tag *",
        "git remote -v *", "git rev-parse --is-inside-work-tree *", "git rev-parse --show-toplevel *",
        "git config --list *", "git log *",
      ],
    },
    action: "allow",
  },
  {
    tool: "bash",
    matches: {
      cmd: [
        "./gradlew *", "./mvnw *", "./build.sh *", "./configure *", "cmake *",
        "./node_modules/.bin/tsc *", "./node_modules/.bin/eslint *",
        "./node_modules/.bin/prettier *", "prettier *",
        "./node_modules/.bin/tailwindcss *", "./node_modules/.bin/tsx *",
        "./node_modules/.bin/vite *", "bun *", "tsx *", "vite *",
      ],
    },
    action: "allow",
  },
  {
    tool: "bash",
    matches: {
      cmd: [
        ".venv/bin/activate *", ".venv/Scripts/activate *",
        "source .venv/bin/activate *", "source venv/bin/activate *",
        "pip list *", "pip show *", "pip check *", "pip freeze *",
        "uv *", "poetry show *", "poetry check *", "pipenv check *",
      ],
    },
    action: "allow",
  },
  {
    tool: "bash",
    matches: {
      cmd: [
        "asdf list *", "asdf current *", "asdf which *",
        "mise list *", "mise current *", "mise which *", "mise use *",
        "rbenv version *", "rbenv versions *", "rbenv which *",
        "nvm list *", "nvm current *", "nvm which *",
      ],
    },
    action: "allow",
  },
  {
    tool: "bash",
    matches: {
      cmd: [
        "./test*", "./run_tests.sh *", "./run_*_tests.sh *", "vitest *",
        "bundle exec rspec *", "bundle exec rubocop *", "rspec *", "rubocop *",
        "swiftlint *", "clippy *", "ruff *", "black *", "isort *",
        "mypy *", "flake8 *", "bandit *", "safety *", "biome check *", "biome format *",
      ],
    },
    action: "allow",
  },
  {
    tool: "bash",
    matches: {
      cmd: [
        "rails server *", "rails s *", "bin/rails server *", "bin/rails s *",
        "flask run *", "django-admin runserver *", "python manage.py runserver *",
        "uvicorn *", "streamlit run *",
      ],
    },
    action: "allow",
  },
  {
    tool: "bash",
    matches: {
      cmd: [
        "bin/rails db:status", "bin/rails db:version",
        "rails db:rollback *", "rails db:status *", "rails db:version *",
        "alembic current *", "alembic history *",
        "bundle exec rails db:status", "bundle exec rails db:version",
      ],
    },
    action: "allow",
  },
  {
    tool: "bash",
    matches: {
      cmd: [
        "docker ps *", "docker images *", "docker logs *", "docker inspect *",
        "docker info *", "docker stats *", "docker system df *", "docker system info *",
        "podman ps *", "podman images *", "podman logs *", "podman inspect *", "podman info *",
      ],
    },
    action: "allow",
  },
  {
    tool: "bash",
    matches: {
      cmd: [
        "aws --version *", "aws configure list *", "aws sts get-caller-identity *", "aws s3 ls *",
        "gcloud config list *", "gcloud auth list *", "gcloud projects list *",
        "az account list *", "az account show *",
        "kubectl get *", "kubectl describe *", "kubectl logs *", "kubectl version *",
        "helm list *", "helm status *", "helm version *",
      ],
    },
    action: "allow",
  },
  {
    tool: "bash",
    matches: {
      cmd: [
        "swift build *", "swift test *", "zig build *", "zig build test*",
        "kotlinc *", "scalac *", "javac *", "javap *", "clang *", "jar *",
        "sbt *", "gradle *", "bazel build *", "bazel test *", "bazel run *",
        "mix *", "lua *", "ruby *", "php *",
      ],
    },
    action: "allow",
  },
  {
    tool: "bash",
    matches: { cmd: ["mkdir -p *", "chmod +x *", "dos2unix *", "unix2dos *", "ln -s *"] },
    action: "allow",
  },
  {
    tool: "bash",
    matches: {
      cmd: [
        "for *", "while *", "do *", "done *", "if *", "then *", "else *",
        "elif *", "fi *", "case *", "esac *", "in *", "function *",
        "select *", "until *", "{ *", "} *", "[[ *", "]] *",
      ],
    },
    action: "ask",
  },
  { tool: "bash", matches: { cmd: "/^find(?!.*(-delete|-exec|-execdir)).*$/" }, action: "allow" },
  {
    tool: "bash",
    matches: { cmd: "/^(echo|ls|pwd|date|whoami|id|uname)\\s.*[&|;].*\\s*(echo|ls|pwd|date|whoami|id|uname)($|\\s.*)/" },
    action: "allow",
  },
  {
    tool: "bash",
    matches: { cmd: "/^(cat|grep|head|tail|less|more|find)\\s.*\\|\\s*(grep|head|tail|less|more|wc|sort|uniq)($|\\s.*)/" },
    action: "allow",
  },
  {
    tool: "bash",
    matches: { cmd: "/^rm\\s+.*(-[rf].*-[rf]|-[rf]{2,}|--recursive.*--force|--force.*--recursive).*$/" },
    action: "ask",
  },
  { tool: "bash", matches: { cmd: "/^find.*(-delete|-exec|-execdir).*$/" }, action: "ask" },
  { tool: "bash", matches: { cmd: "/^(ls|cat|grep|head|tail|file|stat)\\s+[^/]*$/" }, action: "allow" },
  {
    tool: "bash",
    matches: { cmd: "/^(?!.*(rm|mv|cp|chmod|chown|sudo|su|dd)\\b).*/dev/(null|zero|stdout|stderr|stdin).*$/" },
    action: "allow",
  },
  { tool: "bash", action: "ask" },
];

const BASE_FILE_RULES_RAW: unknown[] = [
  {
    tool: "read",
    matches: {
      path: [
        "/\\.(pem|key|p12|pfx|jks|keystore|der|crt|cer)$/i",
        "/(^|[\\\\/])\\.env(?:\\.(?!example$|sample$|template$)[^\\\\/]+)?$/i",
        "/(^|[\\\\/])id_rsa(?:\\.pub)?$/i",
        "/(^|[\\\\/])\\.ssh([\\\\/]|$)/i",
        "/(^|[\\\\/])\\.git([\\\\/]|$)/i",
      ]
    },
    action: "reject",
    message: "Protected path. Reading is disabled for this target."
  },
  {
    tool: "write",
    matches: {
      path: [
        "/(^|[\\\\/])\\.env(?:\\.(?!example$|sample$|template$)[^\\\\/]+)?$/i",
        "/(^|[\\\\/])id_rsa(?:\\.pub)?$/i",
        "/(^|[\\\\/])\\.ssh([\\\\/]|$)/i",
        "/(^|[\\\\/])\\.git([\\\\/]|$)/i",
        "/(^|[\\\\/])node_modules([\\\\/]|$)/i",
        "/\\.(pem|key|p12|pfx|jks|keystore|der|crt|cer)$/i"
      ],
    },
    action: "reject",
    message: "Protected path. Write is disabled for this target.",
  },
  {
    tool: "edit",
    matches: {
      path: [
        "/(^|[\\\\/])\\.env(?:\\.(?!example$|sample$|template$)[^\\\\/]+)?$/i",
        "/(^|[\\\\/])id_rsa(?:\\.pub)?$/i",
        "/(^|[\\\\/])\\.ssh([\\\\/]|$)/i",
        "/(^|[\\\\/])\\.git([\\\\/]|$)/i",
        "/(^|[\\\\/])node_modules([\\\\/]|$)/i",
        "/\\.(pem|key|p12|pfx|jks|keystore|der|crt|cer)$/i"
      ],
    },
    action: "reject",
    message: "Protected path. Edit is disabled for this target.",
  },
];

const BASE_DEFAULT_RULES =
  compileRulesArray(
    [...BASE_BASH_RULES_RAW, ...BASE_FILE_RULES_RAW, { tool: "*", action: "allow" }],
    "<base-defaults>",
  ) ?? [];

// =============================================================================
// Paths + cache
// =============================================================================

const rulesCache = new Map<string, CachedRulesEntry>();

function getAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
}

function getPermissionsSources(cwd: string): {
  projectFile: string;
  projectDir: string;
  globalFile: string;
  globalDir: string;
} {
  const projectRoot = path.resolve(cwd, ".pi");
  const globalRoot = getAgentDir();

  return {
    projectFile: path.join(projectRoot, "permissions.json"),
    projectDir: path.join(projectRoot, "permissions.d"),
    globalFile: path.join(globalRoot, "permissions.json"),
    globalDir: path.join(globalRoot, "permissions.d"),
  };
}

function getPermissionsPaths(cwd: string): { project: string; global: string } {
  const src = getPermissionsSources(cwd);
  return {
    project: src.projectFile,
    global: src.globalFile,
  };
}

function listRuleFilesInDirectory(dirPath: string): string[] {
  try {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return [];
  } catch {
    return [];
  }

  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => path.join(dirPath, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function readRulesFromFileWithCache(filePath: string): CompiledRule[] | null {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
  } catch {
    return null;
  }

  const cached = rulesCache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.rules;
  }

  let compiled: CompiledRule[] | null = null;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    compiled = compileRulesArray(parsed, filePath);
  } catch {
    compiled = null;
  }

  rulesCache.set(filePath, {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    rules: compiled,
  });

  return compiled;
}

function readRulesFromDirectory(dirPath: string): { files: string[]; rules: CompiledRule[] } | null {
  const files = listRuleFilesInDirectory(dirPath);
  if (files.length === 0) return null;

  const combined: CompiledRule[] = [];

  for (const filePath of files) {
    const fileRules = readRulesFromFileWithCache(filePath);
    if (!fileRules) return null;
    combined.push(...fileRules);
  }

  if (combined.length === 0) return null;
  return { files, rules: combined };
}

function resolveRules(cwd: string): LoadedRules {
  const src = getPermissionsSources(cwd);

  // Project-local rules override global. Directory form overrides single file.
  const projectDirRules = readRulesFromDirectory(src.projectDir);
  if (projectDirRules) {
    return {
      path: `${src.projectDir} (${projectDirRules.files.length} file(s))`,
      rules: projectDirRules.rules,
    };
  }

  const projectFileRules = readRulesFromFileWithCache(src.projectFile);
  if (projectFileRules) {
    return { path: src.projectFile, rules: projectFileRules };
  }

  const globalDirRules = readRulesFromDirectory(src.globalDir);
  if (globalDirRules) {
    return {
      path: `${src.globalDir} (${globalDirRules.files.length} file(s))`,
      rules: globalDirRules.rules,
    };
  }

  const globalFileRules = readRulesFromFileWithCache(src.globalFile);
  if (globalFileRules) {
    return { path: src.globalFile, rules: globalFileRules };
  }

  return { path: src.globalFile, rules: BASE_DEFAULT_RULES };
}

// =============================================================================
// Validation
// =============================================================================

function normalizePatternField(value: unknown): string[] | null {
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((x) => typeof x === "string")) return value as string[];
  return null;
}

function parseAction(value: unknown): PermissionAction | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase();
  if (normalized === "allow" || normalized === "ask" || normalized === "reject") return normalized;
  return null;
}

function parseMatchesObject(value: unknown): { cmd?: string[]; path?: string[] } {
  if (!value || typeof value !== "object") return {};
  const obj = value as Record<string, unknown>;

  const cmd = normalizePatternField(obj.cmd) ?? undefined;
  const matchPath = normalizePatternField(obj.path) ?? undefined;

  return { cmd, path: matchPath };
}

function validatePatternSyntax(pattern: string): string | null {
  if (pattern === "*") return null;

  const regexMatch = pattern.match(/^\/(.+)\/([gimsuy]*)$/);
  if (!regexMatch) return null;

  try {
    new RegExp(regexMatch[1], regexMatch[2]);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid regex";
    return `invalid regex pattern ${pattern}: ${message}`;
  }
}

function validateRulesArray(raw: unknown): string[] {
  const issues: string[] = [];

  if (!Array.isArray(raw)) {
    issues.push("top-level JSON must be an array of rules");
    return issues;
  }

  raw.forEach((entry, index) => {
    const label = `rule #${index + 1}`;

    if (!entry || typeof entry !== "object") {
      issues.push(`${label}: must be an object`);
      return;
    }

    const rule = entry as RawRuleObject;

    if (typeof rule.tool !== "string" || rule.tool.trim() === "") {
      issues.push(`${label}: "tool" must be a non-empty string`);
    }

    if (!parseAction(rule.action)) {
      issues.push(`${label}: "action" must be one of allow | ask | reject`);
    }

    if (rule.message !== undefined && typeof rule.message !== "string") {
      issues.push(`${label}: "message" must be a string when provided`);
    }

    if (rule.matches !== undefined && (!rule.matches || typeof rule.matches !== "object")) {
      issues.push(`${label}: "matches" must be an object`);
      return;
    }

    const tool = typeof rule.tool === "string" ? rule.tool.trim().toLowerCase() : "";
    const matches = parseMatchesObject(rule.matches);

    if (rule.matches !== undefined) {
      const rawMatches = rule.matches as Record<string, unknown>;
      if (rawMatches.cmd !== undefined && !normalizePatternField(rawMatches.cmd)) {
        issues.push(`${label}: "matches.cmd" must be a string or string[]`);
      }
      if (rawMatches.path !== undefined && !normalizePatternField(rawMatches.path)) {
        issues.push(`${label}: "matches.path" must be a string or string[]`);
      }
    }

    matches.cmd?.forEach((pattern) => {
      const err = validatePatternSyntax(pattern);
      if (err) issues.push(`${label}: ${err}`);
    });

    matches.path?.forEach((pattern) => {
      const err = validatePatternSyntax(pattern);
      if (err) issues.push(`${label}: ${err}`);
    });

    // Discriminated-rule validation (tool-specific matcher fields)
    if (tool === "bash" && matches.path && matches.path.length > 0) {
      issues.push(`${label}: bash rules may only use matches.cmd`);
    }

    if ((tool === "read" || tool === "write" || tool === "edit") && matches.cmd && matches.cmd.length > 0) {
      issues.push(`${label}: ${tool} rules may only use matches.path`);
    }

    if (tool && tool !== "*" && tool !== "bash" && tool !== "read" && tool !== "write" && tool !== "edit") {
      if ((matches.cmd && matches.cmd.length > 0) || (matches.path && matches.path.length > 0)) {
        issues.push(`${label}: custom tool rules cannot use matches.cmd or matches.path`);
      }
    }
  });

  return issues;
}

function validateRulesFile(filePath: string): ValidateFileReport {
  if (!fs.existsSync(filePath)) {
    return { exists: false, rulesCount: 0, issues: [] };
  }

  try {
    const text = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(text) as unknown;
    const issues = validateRulesArray(parsed);
    const rulesCount = Array.isArray(parsed) ? parsed.length : 0;
    return { exists: true, rulesCount, issues };
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid JSON";
    return {
      exists: true,
      rulesCount: 0,
      issues: [`invalid JSON: ${message}`],
    };
  }
}

function validateRulesDirectory(dirPath: string): {
  exists: boolean;
  filesCount: number;
  rulesCount: number;
  issues: string[];
} {
  if (!fs.existsSync(dirPath)) {
    return { exists: false, filesCount: 0, rulesCount: 0, issues: [] };
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(dirPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unable to read path";
    return {
      exists: true,
      filesCount: 0,
      rulesCount: 0,
      issues: [message],
    };
  }

  if (!stat.isDirectory()) {
    return {
      exists: true,
      filesCount: 0,
      rulesCount: 0,
      issues: ["path exists but is not a directory"],
    };
  }

  const files = listRuleFilesInDirectory(dirPath);
  if (files.length === 0) {
    return {
      exists: true,
      filesCount: 0,
      rulesCount: 0,
      issues: [],
    };
  }

  const issues: string[] = [];
  let rulesCount = 0;

  for (const filePath of files) {
    const report = validateRulesFile(filePath);
    rulesCount += report.rulesCount;

    if (report.issues.length > 0) {
      issues.push(`${path.basename(filePath)}: ${report.issues.length} issue(s)`);
      issues.push(...report.issues.map((issue) => `  • ${issue}`));
    }
  }

  return {
    exists: true,
    filesCount: files.length,
    rulesCount,
    issues,
  };
}

// =============================================================================
// Compile + matching
// =============================================================================

function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function createPatternMatcher(pattern: string): PatternMatcher | null {
  if (pattern === "*") {
    return {
      raw: pattern,
      test: () => true,
    };
  }

  const regexMatch = pattern.match(/^\/(.+)\/([gimsuy]*)$/);
  if (regexMatch) {
    try {
      const rx = new RegExp(regexMatch[1], regexMatch[2]);
      return {
        raw: pattern,
        test: (value: string) => rx.test(value),
      };
    } catch {
      return null;
    }
  }

  const globRegex = globToRegex(pattern);
  return {
    raw: pattern,
    test: (value: string) => globRegex.test(value),
  };
}

function compileMatchers(patterns: PatternInput): PatternMatcher[] | undefined {
  const list = normalizePatternField(patterns);
  if (!list || list.length === 0) return undefined;

  const compiled = list.map((pattern) => createPatternMatcher(pattern)).filter((m): m is PatternMatcher => m !== null);
  return compiled.length > 0 ? compiled : undefined;
}

function compileRule(raw: unknown, sourcePath: string, sourceIndex: number): CompiledRule | null {
  if (!raw || typeof raw !== "object") return null;

  const obj = raw as RawRuleObject;
  const toolRaw = typeof obj.tool === "string" ? obj.tool.trim().toLowerCase() : "*";
  const action = parseAction(obj.action);
  if (!action) return null;

  const message = typeof obj.message === "string" ? obj.message : undefined;
  const matches = parseMatchesObject(obj.matches);

  const base: RuleBase = {
    action,
    message,
    sourcePath,
    sourceIndex,
  };

  if (toolRaw === "bash") {
    return {
      ...base,
      kind: "bash",
      cmdMatchers: compileMatchers(matches.cmd),
    };
  }

  if (toolRaw === "read" || toolRaw === "write" || toolRaw === "edit") {
    return {
      ...base,
      kind: toolRaw,
      pathMatchers: compileMatchers(matches.path),
    };
  }

  if (toolRaw === "*") {
    return {
      ...base,
      kind: "wildcard",
      cmdMatchers: compileMatchers(matches.cmd),
      pathMatchers: compileMatchers(matches.path),
    };
  }

  // Custom tools: only direct tool matching (no cmd/path matchers).
  return {
    ...base,
    kind: "tool",
    tool: toolRaw,
  };
}

function compileRulesArray(raw: unknown, sourcePath: string): CompiledRule[] | null {
  if (!Array.isArray(raw)) return null;

  const compiled = raw
    .map((entry, idx) => compileRule(entry, sourcePath, idx + 1))
    .filter((rule): rule is CompiledRule => rule !== null);

  return compiled.length > 0 ? compiled : null;
}

function matchesMatchers(matchers: PatternMatcher[] | undefined, value: string): boolean {
  if (!matchers || matchers.length === 0) return true;
  return matchers.some((matcher) => matcher.test(value));
}

function matchRule(rule: CompiledRule, event: PermissionEventInput): boolean {
  switch (rule.kind) {
    case "bash":
      if (event.toolName !== "bash") return false;
      return matchesMatchers(rule.cmdMatchers, event.command);

    case "read":
    case "write":
    case "edit":
      if (event.toolName !== rule.kind) return false;
      return matchesMatchers(rule.pathMatchers, event.targetPath);

    case "wildcard":
      if (event.toolName === "bash") {
        if (rule.cmdMatchers) return matchesMatchers(rule.cmdMatchers, event.command);
        if (rule.pathMatchers) return false;
        return true;
      }

      if (event.toolName === "read" || event.toolName === "write" || event.toolName === "edit") {
        if (rule.pathMatchers) return matchesMatchers(rule.pathMatchers, event.targetPath);
        if (rule.cmdMatchers) return false;
        return true;
      }

      // Avoid accidental cross-tool matching when cmd/path filters are present.
      if (rule.cmdMatchers || rule.pathMatchers) return false;
      return true;

    case "tool":
      return event.toolName.toLowerCase() === rule.tool;

    default:
      return false;
  }
}

function findFirstMatchingRule(rules: CompiledRule[], event: PermissionEventInput): CompiledRule | null {
  for (const rule of rules) {
    if (matchRule(rule, event)) return rule;
  }
  return null;
}

function evaluateEvent(
  rules: CompiledRule[],
  event: PermissionEventInput,
): { action: PermissionAction; rule?: CompiledRule } {
  const rule = findFirstMatchingRule(rules, event);
  if (!rule) return { action: "allow" };
  return { action: rule.action, rule };
}

// =============================================================================
// IO helpers
// =============================================================================

function extractCommand(input: unknown): string {
  const obj = input as { command?: unknown; cmd?: unknown } | undefined;
  if (!obj) return "";
  if (typeof obj.command === "string") return obj.command;
  if (typeof obj.cmd === "string") return obj.cmd;
  return "";
}

function extractPath(input: unknown): string {
  const obj = input as { path?: unknown } | undefined;
  if (!obj) return "";
  return typeof obj.path === "string" ? obj.path : "";
}

function report(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  level: NotifyLevel,
  summary: string,
  lines: string[],
  customType = "permissions-report",
): void {
  if (ctx.hasUI) {
    ctx.ui.notify(summary, level);
  }

  pi.sendMessage({
    customType,
    display: true,
    content: [summary, "", ...lines].join("\n"),
  });
}

// =============================================================================
// Extension
// =============================================================================

export default function permissionsExtension(pi: ExtensionAPI) {
  pi.registerCommand("permissions", {
    description: "Show active permissions source. Supports permissions.json and permissions.d/*.json. Use /permissions validate to validate rule sources.",
    handler: async (args, ctx) => {
      const subcommand = args.trim().toLowerCase();
      const src = getPermissionsSources(ctx.cwd);

      if (subcommand === "validate") {
        const projectDirReport = validateRulesDirectory(src.projectDir);
        const projectFileReport = validateRulesFile(src.projectFile);
        const globalDirReport = validateRulesDirectory(src.globalDir);
        const globalFileReport = validateRulesFile(src.globalFile);

        const diagnostics: string[] = [];

        if (projectDirReport.exists) {
          if (projectDirReport.issues.length === 0) {
            diagnostics.push(
              `project dir: OK (${projectDirReport.rulesCount} rule(s) across ${projectDirReport.filesCount} file(s)) — ${src.projectDir}`,
            );
          } else {
            diagnostics.push(`project dir: ${projectDirReport.issues.length} issue(s) — ${src.projectDir}`);
            diagnostics.push(...projectDirReport.issues.map((issue) => `  • ${issue}`));
          }
        } else {
          diagnostics.push(`project dir: not found — ${src.projectDir}`);
        }

        if (projectFileReport.exists) {
          if (projectFileReport.issues.length === 0) {
            diagnostics.push(`project file: OK (${projectFileReport.rulesCount} rule(s)) — ${src.projectFile}`);
          } else {
            diagnostics.push(`project file: ${projectFileReport.issues.length} issue(s) — ${src.projectFile}`);
            diagnostics.push(...projectFileReport.issues.map((issue) => `  • ${issue}`));
          }
        } else {
          diagnostics.push(`project file: not found — ${src.projectFile}`);
        }

        if (globalDirReport.exists) {
          if (globalDirReport.issues.length === 0) {
            diagnostics.push(
              `global dir: OK (${globalDirReport.rulesCount} rule(s) across ${globalDirReport.filesCount} file(s)) — ${src.globalDir}`,
            );
          } else {
            diagnostics.push(`global dir: ${globalDirReport.issues.length} issue(s) — ${src.globalDir}`);
            diagnostics.push(...globalDirReport.issues.map((issue) => `  • ${issue}`));
          }
        } else {
          diagnostics.push(`global dir: not found — ${src.globalDir}`);
        }

        if (globalFileReport.exists) {
          if (globalFileReport.issues.length === 0) {
            diagnostics.push(`global file: OK (${globalFileReport.rulesCount} rule(s)) — ${src.globalFile}`);
          } else {
            diagnostics.push(`global file: ${globalFileReport.issues.length} issue(s) — ${src.globalFile}`);
            diagnostics.push(...globalFileReport.issues.map((issue) => `  • ${issue}`));
          }
        } else {
          diagnostics.push(`global file: not found — ${src.globalFile}`);
        }

        const active = resolveRules(ctx.cwd);
        diagnostics.push(`active source: ${active.path} (${active.rules.length} loaded rule(s))`);

        const hasIssues =
          projectDirReport.issues.length > 0 ||
          projectFileReport.issues.length > 0 ||
          globalDirReport.issues.length > 0 ||
          globalFileReport.issues.length > 0;

        report(
          pi,
          ctx,
          hasIssues ? "warning" : "info",
          hasIssues ? "Permissions validation found issues." : "Permissions validation passed.",
          diagnostics,
          "permissions-validate",
        );
        return;
      }

      const loaded = resolveRules(ctx.cwd);
      report(
        pi,
        ctx,
        "info",
        "Permissions loaded.",
        [
          `source: ${loaded.path}`,
          `rules: ${loaded.rules.length}`,
        ],
        "permissions-info",
      );
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    const loaded = resolveRules(ctx.cwd);

    const permissionEvent: PermissionEventInput = {
      toolName: event.toolName.toLowerCase(),
      command: event.toolName === "bash" ? extractCommand(event.input).trim() : "",
      targetPath: event.toolName === "read" || event.toolName === "write" || event.toolName === "edit" ? extractPath(event.input).trim() : "",
    };

    const decision = evaluateEvent(loaded.rules, permissionEvent);

    if (decision.action === "allow") return undefined;

    if (decision.action === "reject") {
      return {
        block: true,
        reason: decision.rule?.message || "Rejected by permissions rule.",
      };
    }

    // ask
    if (!ctx.hasUI) {
      return {
        block: true,
        reason: decision.rule?.message || "Command requires confirmation (no UI available).",
      };
    }

    const subject =
      permissionEvent.toolName === "bash"
        ? permissionEvent.command
        : permissionEvent.targetPath || permissionEvent.toolName;

    const ok = await ctx.ui.confirm(
      "Permission required",
      `${decision.rule?.message ?? "A permission rule requires confirmation."}\n\nProceed with:\n${subject}`,
    );

    if (!ok) {
      return {
        block: true,
        reason: "Blocked by user",
      };
    }

    return undefined;
  });
}

// =============================================================================
// Test exports
// =============================================================================

export const __permissionsInternals = {
  compileRulesArray,
  evaluateEvent,
  findFirstMatchingRule,
  matchRule,
  validateRulesArray,
  validatePatternSyntax,
  getPermissionsPaths,
};
