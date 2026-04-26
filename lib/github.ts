import {
  InventoryDocument,
  InventoryDocumentSchema,
  JstIsoDateTimeSchema,
  toJstIsoString,
  validateInventoryDocument
} from "./inventory-schema.js";

const INVENTORY_PATH = "inventory.json";
const GITHUB_API_VERSION = "2022-11-28";

export type WriteInventoryInput = {
  inventory: unknown;
  expected_updated_at?: unknown;
  commit_message?: unknown;
};

export type WriteInventoryResult =
  | {
      ok: true;
      commit_sha: string;
      content_url: string;
      updated_at: string;
    }
  | {
      ok: false;
      error: "schema_error" | "conflict" | "github_error" | "configuration_error" | "internal_error";
      message: string;
      issues?: string[];
      missing?: string[];
    };

export class ConfigurationError extends Error {
  constructor(readonly missing: string[]) {
    super(`Missing environment variables: ${missing.join(", ")}`);
    this.name = "ConfigurationError";
  }
}

export class ConflictError extends Error {
  constructor(readonly currentUpdatedAt: string, readonly expectedUpdatedAt: string) {
    super("inventory.json was updated after expected_updated_at");
    this.name = "ConflictError";
  }
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

type GitHubConfig = {
  token: string;
  owner: string;
  repo: string;
  branch: string;
};

type GitHubContentFile = {
  sha: string;
  content: string;
  encoding: string;
  html_url?: string;
};

type GitHubUpdateResponse = {
  content?: {
    html_url?: string;
  };
  commit?: {
    sha?: string;
  };
};

export function loadGitHubConfig(env: NodeJS.ProcessEnv = process.env): GitHubConfig {
  const required = ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BRANCH"] as const;
  const missing = required.filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new ConfigurationError([...missing]);
  }

  return {
    token: env.GITHUB_TOKEN as string,
    owner: env.GITHUB_OWNER as string,
    repo: env.GITHUB_REPO as string,
    branch: env.GITHUB_BRANCH as string
  };
}

function githubContentsUrl(config: GitHubConfig): string {
  const owner = encodeURIComponent(config.owner);
  const repo = encodeURIComponent(config.repo);
  return `https://api.github.com/repos/${owner}/${repo}/contents/${INVENTORY_PATH}`;
}

function inventoryContentUrl(config: GitHubConfig): string {
  return `https://github.com/${config.owner}/${config.repo}/blob/${config.branch}/${INVENTORY_PATH}`;
}

function githubHeaders(config: GitHubConfig): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${config.token}`,
    "Content-Type": "application/json",
    "User-Agent": "kitchen-inventory-mcp",
    "X-GitHub-Api-Version": GITHUB_API_VERSION
  };
}

async function parseGitHubError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === "string" ? body.message : response.statusText;
  } catch {
    return response.statusText;
  }
}

function assertGitHubContentFile(input: unknown): GitHubContentFile {
  if (
    typeof input === "object" &&
    input !== null &&
    "sha" in input &&
    "content" in input &&
    "encoding" in input &&
    typeof input.sha === "string" &&
    typeof input.content === "string" &&
    input.encoding === "base64"
  ) {
    return input as GitHubContentFile;
  }

  throw new GitHubApiError("GitHub did not return a base64 inventory.json file");
}

function decodeBase64Content(content: string): string {
  return Buffer.from(content.replace(/\s/g, ""), "base64").toString("utf8");
}

async function fetchCurrentInventory(config: GitHubConfig): Promise<{
  sha: string;
  inventory: InventoryDocument;
}> {
  const response = await fetch(`${githubContentsUrl(config)}?ref=${encodeURIComponent(config.branch)}`, {
    method: "GET",
    headers: githubHeaders(config)
  });

  if (!response.ok) {
    throw new GitHubApiError(await parseGitHubError(response), response.status);
  }

  const file = assertGitHubContentFile(await response.json());
  const content = decodeBase64Content(file.content);
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(content);
  } catch {
    throw new GitHubApiError("Current inventory.json is not valid JSON");
  }

  const validation = validateInventoryDocument(parsedJson);

  if (!validation.ok) {
    throw new GitHubApiError("Current inventory.json does not match the inventory schema");
  }

  return {
    sha: file.sha,
    inventory: validation.inventory
  };
}

async function commitInventory(config: GitHubConfig, sha: string, inventory: InventoryDocument, message: string) {
  const content = `${JSON.stringify(inventory, null, 2)}\n`;
  const response = await fetch(githubContentsUrl(config), {
    method: "PUT",
    headers: githubHeaders(config),
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      sha,
      branch: config.branch
    })
  });

  if (!response.ok) {
    throw new GitHubApiError(await parseGitHubError(response), response.status);
  }

  return (await response.json()) as GitHubUpdateResponse;
}

function parseOptionalExpectedUpdatedAt(input: unknown): string | undefined {
  if (input === undefined || input === null || input === "") {
    return undefined;
  }

  const parsed = JstIsoDateTimeSchema.safeParse(input);
  return parsed.success ? parsed.data : undefined;
}

function parseCommitMessage(input: unknown): string {
  if (typeof input !== "string") {
    return "Update inventory";
  }

  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : "Update inventory";
}

export async function writeInventory(input: WriteInventoryInput): Promise<WriteInventoryResult> {
  const inventoryValidation = validateInventoryDocument(input.inventory);
  const expectedUpdatedAt = parseOptionalExpectedUpdatedAt(input.expected_updated_at);
  const commitMessageIssue =
    input.commit_message !== undefined && typeof input.commit_message !== "string"
      ? "commit_message は文字列にしてください"
      : undefined;

  if (
    !inventoryValidation.ok ||
    (input.expected_updated_at !== undefined && expectedUpdatedAt === undefined) ||
    commitMessageIssue !== undefined
  ) {
    return {
      ok: false,
      error: "schema_error",
      message: "write_inventory input does not match the inventory schema",
      issues: [
        ...(!inventoryValidation.ok ? inventoryValidation.issues : []),
        ...(input.expected_updated_at !== undefined && expectedUpdatedAt === undefined
          ? ["expected_updated_at は日本時間の ISO 8601 文字列にしてください"]
          : []),
        ...(commitMessageIssue !== undefined ? [commitMessageIssue] : [])
      ]
    };
  }

  let config: GitHubConfig;

  try {
    config = loadGitHubConfig();
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return {
        ok: false,
        error: "configuration_error",
        message: "GitHub environment variables are not fully configured",
        missing: error.missing
      };
    }

    throw error;
  }

  try {
    const current = await fetchCurrentInventory(config);

    if (expectedUpdatedAt !== undefined && current.inventory.updated_at !== expectedUpdatedAt) {
      throw new ConflictError(current.inventory.updated_at, expectedUpdatedAt);
    }

    const updatedInventory = InventoryDocumentSchema.parse({
      ...inventoryValidation.inventory,
      updated_at: toJstIsoString()
    });
    const update = await commitInventory(config, current.sha, updatedInventory, parseCommitMessage(input.commit_message));

    return {
      ok: true,
      commit_sha: update.commit?.sha ?? "",
      content_url: update.content?.html_url ?? inventoryContentUrl(config),
      updated_at: updatedInventory.updated_at
    };
  } catch (error) {
    if (error instanceof ConflictError) {
      return {
        ok: false,
        error: "conflict",
        message: error.message
      };
    }

    if (error instanceof GitHubApiError) {
      return {
        ok: false,
        error: "github_error",
        message: error.message
      };
    }

    return {
      ok: false,
      error: "internal_error",
      message: "Unexpected error while updating inventory.json"
    };
  }
}
