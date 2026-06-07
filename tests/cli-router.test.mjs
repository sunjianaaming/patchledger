import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const cli = resolve("bin/patchledger.mjs");

async function tempProject() {
  const dir = await mkdtemp(join(tmpdir(), "patchledger-router-"));
  spawnSync("git", ["init"], { cwd: dir, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: dir, stdio: "ignore" });
  spawnSync("git", ["config", "user.name", "Test User"], { cwd: dir, stdio: "ignore" });
  await writeFile(join(dir, "README.md"), "Old install steps\n", "utf8");
  spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" });
  return dir;
}

function runCli(args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn("node", [cli, ...args], {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
    }, options.timeout ?? 12000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({
        status: code,
        signal,
        stdout,
        stderr,
        error: signal ? new Error(`terminated by ${signal}`) : null
      });
    });
  });
}

async function mockOpenAiServer() {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push({ url: req.url, body });
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Connection", "close");
    res.end(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            plan: "Update README installation text.",
            unifiedDiff: [
              "diff --git a/README.md b/README.md",
              "index 1111111..2222222 100644",
              "--- a/README.md",
              "+++ b/README.md",
              "@@ -1 +1 @@",
              "-Old install steps",
              "+New install steps"
            ].join("\n")
          })
        }
      }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 30,
        total_tokens: 130
      }
    }));
  });
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const port = server.address().port;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    requests,
    close: () => new Promise((resolveClose) => {
      server.closeAllConnections();
      server.close(resolveClose);
    })
  };
}

test("init creates local router config and policy", async () => {
  const cwd = await tempProject();
  const result = await runCli(["init", "--openai-model", "gpt-test", "--anthropic-model", "claude-test", "--test-command", "node --version"], { cwd });

  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(await readFile(join(cwd, ".patchledger", "config.json"), "utf8"));
  const policy = JSON.parse(await readFile(join(cwd, ".patchledger", "policy.json"), "utf8"));
  assert.equal(config.providers.openai.apiKeyRef, "OPENAI_API_KEY");
  assert.equal(config.tiers.cheap.model, "gpt-test");
  assert.equal(config.tiers.mid.model, "claude-test");
  assert.equal(policy.checks.test, "node --version");
  assert.match(result.stdout, /PatchLedger Router initialized/);
});

test("recommend classifies low-risk docs task without modifying files", async () => {
  const cwd = await tempProject();
  await runCli(["init"], { cwd });
  const result = await runCli(["recommend", "update README installation steps"], { cwd });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Task type: docs_rewrite/);
  assert.match(result.stdout, /Risk level: low/);
  assert.match(result.stdout, /Recommended tier: cheap/);
});

test("doctor checks local router provider key availability", async () => {
  const cwd = await tempProject();
  await runCli(["init"], { cwd });
  const result = await runCli(["doctor"], {
    cwd,
    env: { OPENAI_API_KEY: "test-key" }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  assert.match(result.stdout, /PatchLedger Router doctor/);
  assert.match(result.stdout, /OpenAI key: available/);
  assert.match(result.stdout, /Anthropic key: missing/);
});

test("run blocks high-risk task before provider call without approval", async () => {
  const cwd = await tempProject();
  const server = await mockOpenAiServer();
  try {
    await runCli(["init", "--openai-base-url", server.baseUrl], { cwd });
    const result = await runCli(["run", "refactor auth permission checks"], {
      cwd,
      env: { OPENAI_API_KEY: "test-key" }
    });

    assert.equal(result.status, 5, result.stderr || result.stdout || String(result.error));
    assert.match(result.stdout, /Approval required before applying a patch/);
    assert.equal(server.requests.length, 0);
  } finally {
    await server.close();
  }
});

test("run applies low-risk provider patch and records task data", async () => {
  const cwd = await tempProject();
  const server = await mockOpenAiServer();
  try {
    await runCli(["init", "--openai-base-url", server.baseUrl, "--openai-model", "gpt-test", "--test-command", "node --version"], { cwd });
    const config = JSON.parse(await readFile(join(cwd, ".patchledger", "config.json"), "utf8"));
    assert.equal(config.providers.openai.baseUrl, server.baseUrl);
    const result = await runCli(["run", "update README installation steps", "--yes"], {
      cwd,
      env: { OPENAI_API_KEY: "test-key" }
    });

    assert.equal(result.status, 0, result.stderr || result.stdout || `${String(result.error)} requests=${server.requests.length}`);
    assert.match(await readFile(join(cwd, "README.md"), "utf8"), /New install steps/);
    assert.match(result.stdout, /Status: completed/);
    assert.equal(server.requests.length, 1);

    const taskId = result.stdout.match(/TaskRun: (task_[^\s]+)/)?.[1];
    assert.ok(taskId);
    const task = JSON.parse(await readFile(join(cwd, ".patchledger", "runs", taskId, "task.json"), "utf8"));
    const costs = await readFile(join(cwd, ".patchledger", "runs", taskId, "cost-records.jsonl"), "utf8");
    assert.equal(task.taskType, "docs_rewrite");
    assert.match(costs, /"provider":"openai"/);
  } finally {
    await server.close();
  }
});

test("result updates quality record and report shows cost plus quality", async () => {
  const cwd = await tempProject();
  const server = await mockOpenAiServer();
  try {
    await runCli(["init", "--openai-base-url", server.baseUrl, "--openai-model", "gpt-test"], { cwd });
    const run = await runCli(["run", "update README installation steps", "--yes"], {
      cwd,
      env: { OPENAI_API_KEY: "test-key" }
    });
    const taskId = run.stdout.match(/TaskRun: (task_[^\s]+)/)?.[1];
    assert.ok(taskId);

    const result = await runCli(["result", "--task", taskId, "--accepted", "yes", "--rework", "no", "--tests", "passed"], { cwd });
    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    assert.match(result.stdout, /Quality result saved/);

    const report = await runCli(["report"], { cwd });
    assert.equal(report.status, 0, report.stderr);
    assert.match(report.stdout, /Accepted: 1/);
    assert.match(report.stdout, /Cost per accepted task/);
  } finally {
    await server.close();
  }
});