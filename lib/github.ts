export interface GitHubPushPayload {
  filename: string;
  sqlContent: string;
  rollbackSql?: string;
  version: string;
  changeType?: string;
  userNotes?: string;
  author?: string;
}

export interface GitHubPushResult {
  pushed: boolean;
  status: "PUSHED" | "LOCAL_ONLY" | "FAILED";
  commitUrl?: string;
  message: string;
}

export function isGitHubConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_TOKEN &&
      process.env.GITHUB_OWNER &&
      process.env.GITHUB_REPO
  );
}

async function upsertGitHubFile(options: {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  repoPath: string;
  content: string;
  commitMessage: string;
}): Promise<{ htmlUrl?: string }> {
  const { token, owner, repo, branch, repoPath, content, commitMessage } = options;
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${repoPath}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  // Check if file already exists to retrieve SHA for updates
  let existingSha: string | undefined;
  const getRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, {
    method: "GET",
    headers,
  });
  if (getRes.ok) {
    const existingData = (await getRes.json()) as { sha?: string };
    existingSha = existingData.sha;
  }

  const putRes = await fetch(apiUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: commitMessage,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch,
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });

  if (!putRes.ok) {
    const errText = await putRes.text();
    throw new Error(`GitHub API ${putRes.status}: ${errText}`);
  }

  const result = (await putRes.json()) as {
    commit?: { html_url?: string };
    content?: { html_url?: string };
  };

  return {
    htmlUrl: result.commit?.html_url || result.content?.html_url,
  };
}

/**
 * Commits and pushes approved forward & rollback SQL migration files to GitHub (SRS FR10 & Use Case 2).
 */
export async function pushMigrationToGitHub(
  payload: GitHubPushPayload
): Promise<GitHubPushResult> {
  if (!isGitHubConfigured()) {
    return {
      pushed: false,
      status: "LOCAL_ONLY",
      message:
        "GitHub credentials not configured in .env.local; migration saved locally in /migrations and PostgreSQL.",
    };
  }

  const token = process.env.GITHUB_TOKEN as string;
  const owner = process.env.GITHUB_OWNER as string;
  const repo = process.env.GITHUB_REPO as string;
  const branch = process.env.GITHUB_BRANCH || "main";
  const basePath = (process.env.GITHUB_MIGRATIONS_PATH || "migrations").replace(
    /^\/|\/$/g,
    ""
  );

  const commitHeader = `[Schema Migration ${payload.version}] (${payload.changeType || "Minor"}) by ${payload.author || "Developer"}`;
  const commitBody = payload.userNotes
    ? `${commitHeader}\n\nChange Notes: ${payload.userNotes}`
    : commitHeader;

  try {
    const forwardPath = `${basePath}/${payload.filename}`;
    const forwardRes = await upsertGitHubFile({
      token,
      owner,
      repo,
      branch,
      repoPath: forwardPath,
      content: payload.sqlContent,
      commitMessage: commitBody,
    });

    if (payload.rollbackSql && payload.rollbackSql.trim()) {
      const rollbackFilename = payload.filename.replace(/\.sql$/i, ".rollback.sql");
      await upsertGitHubFile({
        token,
        owner,
        repo,
        branch,
        repoPath: `${basePath}/${rollbackFilename}`,
        content: payload.rollbackSql,
        commitMessage: `[Rollback Script ${payload.version}] ${rollbackFilename}`,
      });
    }

    return {
      pushed: true,
      status: "PUSHED",
      commitUrl: forwardRes.htmlUrl,
      message: `Approved migration ${payload.version} pushed to ${owner}/${repo} (${branch}).`,
    };
  } catch (error) {
    return {
      pushed: false,
      status: "FAILED",
      message:
        error instanceof Error
          ? `GitHub push failed (saved locally): ${error.message}`
          : "GitHub push failed (saved locally).",
    };
  }
}
