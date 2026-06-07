#!/usr/bin/env node

import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const version = "0.1.0";
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = resolve(process.env.PATCHLEDGER_CONFIG || join(process.cwd(), ".patchledger", "config.json"));
const configDir = dirname(configPath);
const policyPath = join(configDir, "policy.json");
const runsDir = join(configDir, "runs");

const defaultConfig = {
  schemaVersion: 1,
  providers: {
    openai: {
      enabled: true,
      apiKeyRef: "OPENAI_API_KEY",
      baseUrl: "https://api.openai.com/v1"
    },
    anthropic: {
      enabled: true,
      apiKeyRef: "ANTHROPIC_API_KEY",
      baseUrl: "https://api.anthropic.com"
    }
  },
  tiers: {
    cheap: { provider: "openai", model: "gpt-4.1-mini" },
    mid: { provider: "anthropic", model: "claude-sonnet" },
    strong: { provider: "anthropic", model: "claude-opus" }
  },
  payloadStorageMode: "metadata_only"
};

const defaultPolicy = {
  schemaVersion: 1,
  checks: { test: "", lint: "", typecheck: "" },
  risk: {
    requireApprovalFor: ["high", "critical"],
    maxFilesWithoutApproval: 5,
    maxLinesWithoutApproval: 250
  }
};

const commands = {
  help: "Show command help.",
  init: "Create local router config and policy.",
  doctor: "Check local config, provider keys, and model settings.",
  recommend: "Recommend a model tier without modifying files.",
  run: "Route and run a local patch-first coding task.",
  result: "Record manual quality outcome for a routed task.",
  report: "Show local task cost and quality report."
};

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] || "help";
  const args = parseArgs(argv.slice(1));
  try {
    if (command === "help" || args.help) return printHelp();
    if (command === "version" || args.version) return console.log(version);
    if (command === "init") return init(args);
    if (command === "doctor") return doctor(args);
    if (command === "recommend") return recommend(args);
    if (command === "run") return runTask(args);
    if (command === "result") return recordResult(args);
    if (command === "report") return report(args);
    fail(`Unknown command: ${command}\n\nRun patchledger help.`);
  } catch (error) {
    fail(error.message);
  }
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      args._.push(value);
      continue;
    }
    const key = toCamel(value.slice(2));
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

async function loadConfig() {
  if (!existsSync(configPath)) return defaultConfig;
  return mergeConfig(JSON.parse(await readFile(configPath, "utf8")));
}

function mergeConfig(fileConfig) {
  return {
    ...defaultConfig,
    ...fileConfig,
    providers: {
      openai: { ...defaultConfig.providers.openai, ...(fileConfig.providers?.openai || {}) },
      anthropic: { ...defaultConfig.providers.anthropic, ...(fileConfig.providers?.anthropic || {}) }
    },
    tiers: {
      cheap: { ...defaultConfig.tiers.cheap, ...(fileConfig.tiers?.cheap || {}) },
      mid: { ...defaultConfig.tiers.mid, ...(fileConfig.tiers?.mid || {}) },
      strong: { ...defaultConfig.tiers.strong, ...(fileConfig.tiers?.strong || {}) }
    }
  };
}

async function loadPolicy() {
  if (!existsSync(policyPath)) return defaultPolicy;
  const policy = JSON.parse(await readFile(policyPath, "utf8"));
  return {
    ...defaultPolicy,
    ...policy,
    checks: { ...defaultPolicy.checks, ...(policy.checks || {}) }
  };
}

async function saveJson(file, value) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2), "utf8");
}

async function init(args) {
  const existing = await loadConfig();
  const config = mergeConfig({
    ...existing,
    providers: {
      openai: {
        ...existing.providers.openai,
        baseUrl: args.openaiBaseUrl || existing.providers.openai.baseUrl
      },
      anthropic: {
        ...existing.providers.anthropic,
        baseUrl: args.anthropicBaseUrl || existing.providers.anthropic.baseUrl
      }
    },
    tiers: {
      cheap: { provider: "openai", model: args.openaiModel || existing.tiers.cheap.model },
      mid: { provider: "anthropic", model: args.anthropicModel || existing.tiers.mid.model },
      strong: { provider: "anthropic", model: args.strongModel || existing.tiers.strong.model }
    }
  });
  await saveJson(configPath, config);

  const policy = await loadPolicy();
  await saveJson(policyPath, {
    ...policy,
    checks: {
      ...policy.checks,
      ...(args.testCommand ? { test: args.testCommand } : {}),
      ...(args.lintCommand ? { lint: args.lintCommand } : {}),
      ...(args.typecheckCommand ? { typecheck: args.typecheckCommand } : {})
    }
  });

  console.log("PatchLedger Router initialized.");
  console.log(`Config: ${configPath}`);
  console.log(`Policy: ${policyPath}`);
  console.log(`OpenAI model: ${config.tiers.cheap.model}`);
  console.log(`Anthropic model: ${config.tiers.mid.model}`);
}

async function doctor() {
  const config = await loadConfig();
  const policy = await loadPolicy();
  console.log("PatchLedger Router doctor");
  console.log(`- Config: ${existsSync(configPath) ? "found" : "missing"} (${configPath})`);
  console.log(`- Policy: ${existsSync(policyPath) ? "found" : "missing"} (${policyPath})`);
  console.log(`- OpenAI key: ${process.env.OPENAI_API_KEY ? "available" : "missing"}`);
  console.log(`- Anthropic key: ${process.env.ANTHROPIC_API_KEY ? "available" : "missing"}`);
  console.log(`- OpenAI model: ${config.tiers.cheap.model}`);
  console.log(`- Anthropic model: ${config.tiers.mid.model}`);
  console.log(`- Test command: ${policy.checks.test || "not configured"}`);
  console.log(`- Lint command: ${policy.checks.lint || "not configured"}`);
  console.log(`- Typecheck command: ${policy.checks.typecheck || "not configured"}`);
}

async function recommend(args) {
  const route = decideRoute(readTaskText(args), await loadConfig(), await loadPolicy());
  printRecommendation(route);
}

async function runTask(args) {
  const taskText = readTaskText(args);
  const config = await loadConfig();
  const policy = await loadPolicy();
  const route = decideRoute(taskText, config, policy);
  const taskId = createId("task");
  const attemptId = "attempt_1";
  const taskDir = join(runsDir, taskId);
  const startedAt = new Date().toISOString();
  await mkdir(join(taskDir, "patches"), { recursive: true });

  const task = {
    id: taskId,
    schemaVersion: 1,
    projectPathHash: sha256(process.cwd()),
    projectDisplayName: process.cwd().split("/").pop() || process.cwd(),
    taskTextHash: sha256(taskText),
    taskTextStored: false,
    taskText: null,
    taskType: route.taskType,
    riskLevel: route.riskLevel,
    status: "created",
    createdAt: startedAt,
    startedAt,
    endedAt: null,
    selectedTier: route.selectedTier,
    selectedProvider: route.selectedProvider,
    selectedModel: route.selectedModel,
    attemptCount: 1,
    tags: {}
  };
  await saveJson(join(taskDir, "task.json"), task);
  await appendJsonl(join(taskDir, "route-decisions.jsonl"), {
    id: createId("route"),
    taskRunId: taskId,
    attemptId,
    ...route,
    createdAt: startedAt
  });

  if (route.approvalRequired && !args.yes) {
    task.status = route.riskLevel === "high" || route.riskLevel === "critical" ? "plan_required" : "awaiting_approval";
    task.endedAt = new Date().toISOString();
    await saveJson(join(taskDir, "task.json"), task);
    printRecommendation(route);
    console.log("");
    console.log("Approval required before applying a patch. Re-run with --yes after reviewing the route.");
    process.exitCode = 5;
    return;
  }

  const providerResult = await callProviderForPatch(config, route, taskText, taskId, attemptId, taskDir);
  const patchPath = join(taskDir, "patches", `${attemptId}.patch`);
  let patchStatus = "not_generated";
  if (providerResult.unifiedDiff) {
    await writeFile(patchPath, ensureTrailingNewline(providerResult.unifiedDiff), "utf8");
    patchStatus = "generated";
  }

  let applyStatus = "not_applied";
  let checkRecords = [];
  if (providerResult.unifiedDiff && args.mode !== "plan") {
    applyStatus = applyPatchFile(patchPath);
    patchStatus = applyStatus === "applied" ? "applied" : "failed";
    if (applyStatus === "applied") checkRecords = await runConfiguredChecks(policy, taskId, attemptId, taskDir);
  }

  await appendJsonl(join(taskDir, "patches.jsonl"), {
    id: createId("patch"),
    taskRunId: taskId,
    attemptId,
    patchPath,
    status: patchStatus,
    changedFiles: changedFilesFromDiff(providerResult.unifiedDiff || ""),
    addedLines: countDiffLines(providerResult.unifiedDiff || "", "+"),
    deletedLines: countDiffLines(providerResult.unifiedDiff || "", "-"),
    createdAt: new Date().toISOString(),
    appliedAt: applyStatus === "applied" ? new Date().toISOString() : null
  });

  const failedCheck = checkRecords.some((record) => record.status === "failed");
  task.status = applyStatus === "applied" && !failedCheck ? "completed" : applyStatus === "failed" ? "patch_failed" : failedCheck ? "checks_failed" : "plan_only";
  task.endedAt = new Date().toISOString();
  await saveJson(join(taskDir, "task.json"), task);
  await saveJson(join(taskDir, "quality.json"), {
    taskRunId: taskId,
    testsStatus: statusForCheck(checkRecords, "test"),
    lintStatus: statusForCheck(checkRecords, "lint"),
    typecheckStatus: statusForCheck(checkRecords, "typecheck"),
    accepted: null,
    reworkRequired: null,
    escalatedToStrongerModel: false,
    reverted: false,
    bugReported: false,
    manualReviewMinutes: null,
    notes: null,
    updatedAt: new Date().toISOString()
  });

  console.log(`TaskRun: ${taskId}`);
  console.log(`Status: ${task.status}`);
  console.log("");
  console.log("Route:");
  console.log(`  Type: ${task.taskType}`);
  console.log(`  Risk: ${task.riskLevel}`);
  console.log(`  Tier: ${task.selectedTier}`);
  console.log(`  Model: ${task.selectedProvider}:${task.selectedModel}`);
  console.log("");
  console.log("Execution:");
  console.log("  Attempts: 1");
  console.log(`  Patch: ${patchStatus}`);
  console.log(`  Checks: ${failedCheck ? "failed" : checkRecords.length > 0 ? "passed" : "not_configured"}`);
  console.log("");
  console.log("Next:");
  console.log(`  patchledger result --task ${taskId} --accepted yes --rework no`);
}

async function callProviderForPatch(config, route, taskText, taskId, attemptId, taskDir) {
  const provider = config.providers?.[route.selectedProvider];
  if (!provider) fail(`Provider not configured: ${route.selectedProvider}`);
  const apiKey = process.env[provider.apiKeyRef];
  if (!apiKey) fail(`Provider key missing: ${provider.apiKeyRef}`);
  const requestId = createId("req");
  const startedAt = new Date();
  try {
    const body = route.selectedProvider === "anthropic"
      ? await callAnthropic(provider, route.selectedModel, apiKey, buildPatchPrompt(taskText))
      : await callOpenAi(provider, route.selectedModel, apiKey, buildPatchPrompt(taskText));
    const usage = normalizeUsage(route.selectedProvider, body);
    await appendJsonl(join(taskDir, "request-events.jsonl"), requestRecord(requestId, taskId, attemptId, route, startedAt, "success", null, usage));
    await appendJsonl(join(taskDir, "cost-records.jsonl"), costRecord(requestId, taskId, attemptId, route, usage));
    return parseProviderPatch(extractProviderContent(route.selectedProvider, body));
  } catch (error) {
    await appendJsonl(join(taskDir, "request-events.jsonl"), requestRecord(requestId, taskId, attemptId, route, startedAt, "failed", "provider_error"));
    fail(error.message);
  }
}

function buildPatchPrompt(taskText) {
  return [
    "You are PatchLedger Router. Produce a JSON object with keys plan and unifiedDiff.",
    "Use a unified git diff only. Do not include markdown fences.",
    `Task: ${taskText}`
  ].join("\n");
}

async function callOpenAi(provider, model, apiKey, prompt) {
  return postJson(new URL("chat/completions", ensureSlash(provider.baseUrl)).toString(), {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  }, {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0
  });
}

async function callAnthropic(provider, model, apiKey, prompt) {
  return postJson(new URL("v1/messages", ensureSlash(provider.baseUrl)).toString(), {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01"
  }, {
    model,
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }]
  });
}

async function postJson(url, headers, body) {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const text = await response.text();
  const parsed = text ? tryJson(text) : {};
  if (!response.ok) {
    const message = parsed?.error?.message || parsed?.message || text || response.statusText;
    throw new Error(`Provider request failed: ${response.status} ${message}`);
  }
  return parsed;
}

function extractProviderContent(provider, body) {
  if (provider === "anthropic") return (body.content || []).map((item) => item.text || "").join("\n");
  return body.choices?.[0]?.message?.content || body.choices?.[0]?.text || "";
}

function parseProviderPatch(content) {
  const trimmed = String(content || "").trim();
  if (!trimmed) return { plan: "", unifiedDiff: "" };
  const parsed = tryJson(trimmed);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return { plan: String(parsed.plan || ""), unifiedDiff: String(parsed.unifiedDiff || parsed.diff || "") };
  }
  return { plan: "", unifiedDiff: trimmed };
}

function normalizeUsage(provider, body) {
  if (provider === "anthropic") {
    const usage = body.usage || {};
    const inputTokens = Number(usage.input_tokens || 0);
    const cachedInputTokens = Number(usage.cache_read_input_tokens || 0);
    const outputTokens = Number(usage.output_tokens || 0);
    return { inputTokens, cachedInputTokens, outputTokens, reasoningTokens: 0, totalTokens: inputTokens + cachedInputTokens + outputTokens };
  }
  const usage = body.usage || {};
  const inputTokens = Number(usage.prompt_tokens || usage.input_tokens || 0);
  const outputTokens = Number(usage.completion_tokens || usage.output_tokens || 0);
  const cachedInputTokens = Number(usage.prompt_tokens_details?.cached_tokens || 0);
  const reasoningTokens = Number(usage.completion_tokens_details?.reasoning_tokens || 0);
  return { inputTokens, cachedInputTokens, outputTokens, reasoningTokens, totalTokens: Number(usage.total_tokens || inputTokens + outputTokens + cachedInputTokens) };
}

function requestRecord(requestId, taskId, attemptId, route, startedAt, status, errorType, usage = {}) {
  const endedAt = new Date();
  return {
    id: requestId,
    taskRunId: taskId,
    attemptId,
    provider: route.selectedProvider,
    biller: route.selectedProvider,
    billingType: "metered_api",
    model: route.selectedModel,
    requestRole: "patch",
    status,
    errorType,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    totalLatencyMs: endedAt.getTime() - startedAt.getTime(),
    inputTokens: usage.inputTokens || 0,
    cachedInputTokens: usage.cachedInputTokens || 0,
    outputTokens: usage.outputTokens || 0,
    reasoningTokens: usage.reasoningTokens || 0,
    payloadStored: false,
    tags: {}
  };
}

function costRecord(requestId, taskId, attemptId, route, usage) {
  return {
    id: createId("cost"),
    taskRunId: taskId,
    attemptId,
    requestEventId: requestId,
    provider: route.selectedProvider,
    biller: route.selectedProvider,
    billingType: "metered_api",
    model: route.selectedModel,
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    totalTokens: usage.totalTokens,
    estimatedCostCents: estimateCostCents(route.selectedProvider, route.selectedModel, usage),
    actualCostCents: null,
    pricingConfidence: usage.totalTokens > 0 ? "estimated" : "unavailable",
    pricingSource: "local_catalog",
    costBasis: usage.totalTokens > 0 ? "tokens" : "unknown",
    createdAt: new Date().toISOString()
  };
}

function decideRoute(taskText, config, policy) {
  const text = taskText.toLowerCase();
  const taskType = classifyTask(text);
  const riskLevel = assessRisk(text, taskType);
  const verifiability = (policy.checks.test || policy.checks.lint || policy.checks.typecheck) ? "high" : "medium";
  const selectedTier = tierFor(taskType, riskLevel, verifiability);
  const tierConfig = config.tiers[selectedTier];
  return {
    taskType,
    riskLevel,
    verifiability,
    recommendedTier: selectedTier,
    selectedTier,
    selectedProvider: tierConfig.provider,
    selectedModel: tierConfig.model,
    confidence: riskLevel === "low" ? 0.8 : 0.65,
    approvalRequired: riskLevel === "high" || riskLevel === "critical",
    riskSignals: riskSignals(text),
    rationale: routeRationale(taskType, riskLevel, selectedTier, verifiability),
    fallbackPolicy: {
      onCheckFailure: selectedTier === "cheap" ? "retry_same_tier_once_then_escalate_mid" : "escalate_strong",
      onPatchFailure: selectedTier === "cheap" ? "escalate_mid" : "stop_and_report"
    }
  };
}

function classifyTask(text) {
  if (/\breadme\b|docs?|documentation|changelog|release note|安装|文档/.test(text)) return "docs_rewrite";
  if (/test|spec|测试|回归/.test(text)) return "test_generation";
  if (/refactor|重构|rename|extract/.test(text)) return "refactor";
  if (/review|pr /.test(text)) return "pr_review";
  if (/migrat|schema|数据库|迁移/.test(text)) return "migration";
  if (/error|stack|log|日志|报错/.test(text)) return "error_explanation";
  if (/bug|fix|修复|failing/.test(text)) return "bugfix";
  return "unknown";
}

function assessRisk(text, taskType) {
  if (/(payment|billing|stripe|auth|security|permission|database|migration|deploy|secret|credential|delete|生产|支付|权限|安全|数据库)/.test(text)) return "critical";
  if (taskType === "migration" || taskType === "refactor" || /multi-file|large|核心|架构/.test(text)) return "high";
  if (taskType === "bugfix" || taskType === "test_generation" || taskType === "pr_review") return "medium";
  return "low";
}

function tierFor(taskType, riskLevel, verifiability) {
  if (riskLevel === "critical" || riskLevel === "high") return "strong";
  if (riskLevel === "medium") return taskType === "test_generation" && verifiability === "high" ? "cheap" : "mid";
  if (taskType === "docs_rewrite" || taskType === "error_explanation" || taskType === "unknown") return "cheap";
  return "mid";
}

function riskSignals(text) {
  return ["payment", "billing", "auth", "security", "permission", "database", "migration", "deploy", "secret", "delete"].filter((signal) => text.includes(signal));
}

function routeRationale(taskType, riskLevel, tier, verifiability) {
  const lines = [`The task was classified as ${taskType}.`, `Risk is ${riskLevel}.`, `Verifiability is ${verifiability}.`, `Recommended tier is ${tier}.`];
  if (riskLevel === "high" || riskLevel === "critical") lines.push("High-risk work should start with a plan and require approval before patching.");
  return lines;
}

function printRecommendation(route) {
  console.log(`Task type: ${route.taskType}`);
  console.log(`Risk level: ${route.riskLevel}`);
  console.log(`Verifiability: ${route.verifiability}`);
  console.log(`Recommended tier: ${route.recommendedTier}`);
  console.log(`Selected model: ${route.selectedProvider}:${route.selectedModel}`);
  console.log(`Approval required: ${route.approvalRequired ? "yes" : "no"}`);
  console.log("");
  console.log("Reason:");
  for (const line of route.rationale) console.log(`- ${line}`);
  console.log("");
  console.log("Fallback:");
  console.log(`- Check failure: ${route.fallbackPolicy.onCheckFailure}`);
  console.log(`- Patch failure: ${route.fallbackPolicy.onPatchFailure}`);
}

async function recordResult(args) {
  if (!args.task) fail("Missing --task.");
  const taskDir = join(runsDir, args.task);
  if (!existsSync(taskDir)) fail(`Task not found: ${args.task}`);
  const file = join(taskDir, "quality.json");
  const existing = existsSync(file) ? JSON.parse(await readFile(file, "utf8")) : { taskRunId: args.task };
  const quality = {
    ...existing,
    testsStatus: args.tests || existing.testsStatus || "unknown",
    lintStatus: args.lint || existing.lintStatus || "unknown",
    typecheckStatus: args.typecheck || existing.typecheckStatus || "unknown",
    accepted: parseYesNo(args.accepted, existing.accepted),
    reworkRequired: parseYesNo(args.rework, existing.reworkRequired),
    updatedAt: new Date().toISOString()
  };
  await saveJson(file, quality);
  console.log("Quality result saved.");
  console.log(`Task: ${args.task}`);
  console.log(`Accepted: ${quality.accepted === true ? "yes" : quality.accepted === false ? "no" : "unknown"}`);
  console.log(`Rework: ${quality.reworkRequired === true ? "yes" : quality.reworkRequired === false ? "no" : "unknown"}`);
  console.log(`Tests: ${quality.testsStatus}`);
}

async function report(args) {
  const rows = await loadLocalTasks();
  const accepted = rows.filter((row) => row.quality.accepted === true);
  const reworked = rows.filter((row) => row.quality.reworkRequired === true);
  const escalated = rows.filter((row) => row.quality.escalatedToStrongerModel === true);
  const totalCost = rows.reduce((sum, row) => sum + row.costCents, 0);
  const cheapRows = rows.filter((row) => row.task.selectedTier === "cheap");
  const cheapAccepted = cheapRows.filter((row) => row.quality.accepted === true && row.quality.reworkRequired === false);
  const data = {
    generatedAt: new Date().toISOString(),
    totalTasks: rows.length,
    acceptedTasks: accepted.length,
    reworkedTasks: reworked.length,
    escalations: escalated.length,
    estimatedCostCents: totalCost,
    costPerAcceptedTaskCents: accepted.length ? Math.round(totalCost / accepted.length) : 0,
    cheapSuccessRate: cheapRows.length ? cheapAccepted.length / cheapRows.length : 0
  };
  if (args.json) return console.log(JSON.stringify(data, null, 2));
  console.log("PatchLedger Router Report");
  console.log(`Generated: ${data.generatedAt}`);
  console.log(`Tasks: ${data.totalTasks}`);
  console.log(`Accepted: ${data.acceptedTasks}`);
  console.log(`Reworked: ${data.reworkedTasks}`);
  console.log(`Escalations: ${data.escalations}`);
  console.log(`Estimated delivery cost: ${money(data.estimatedCostCents)}`);
  console.log(`Cost per accepted task: ${money(data.costPerAcceptedTaskCents)}`);
  console.log(`Cheap success rate: ${percent(data.cheapSuccessRate)}`);
}

async function loadLocalTasks() {
  if (!existsSync(runsDir)) return [];
  const entries = await readdir(runsDir, { withFileTypes: true });
  const rows = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const taskDir = join(runsDir, entry.name);
    const taskFile = join(taskDir, "task.json");
    if (!existsSync(taskFile)) continue;
    const task = JSON.parse(await readFile(taskFile, "utf8"));
    const quality = existsSync(join(taskDir, "quality.json")) ? JSON.parse(await readFile(join(taskDir, "quality.json"), "utf8")) : {};
    const costs = existsSync(join(taskDir, "cost-records.jsonl")) ? parseJsonl(await readFile(join(taskDir, "cost-records.jsonl"), "utf8")) : [];
    rows.push({ task, quality, costCents: costs.reduce((sum, cost) => sum + Number(cost.estimatedCostCents || cost.actualCostCents || 0), 0) });
  }
  return rows;
}

async function runConfiguredChecks(policy, taskId, attemptId, taskDir) {
  const records = [];
  for (const [kind, command] of Object.entries(policy.checks || {})) {
    if (!command) continue;
    const startedAt = new Date();
    let status = "passed";
    let exitCode = 0;
    let outputSummary = "";
    try {
      outputSummary = firstLines(execFileSync("sh", ["-lc", command], { cwd: process.cwd(), encoding: "utf8", stdio: "pipe" }));
    } catch (error) {
      status = "failed";
      exitCode = Number(error.status || 1);
      outputSummary = firstLines(`${error.stdout || ""}\n${error.stderr || ""}`);
    }
    const record = { id: createId("check"), taskRunId: taskId, attemptId, kind, commandHash: sha256(command), commandDisplay: command, status, exitCode, durationMs: Date.now() - startedAt.getTime(), outputSummary, startedAt: startedAt.toISOString(), endedAt: new Date().toISOString() };
    await appendJsonl(join(taskDir, "checks.jsonl"), record);
    records.push(record);
  }
  return records;
}

function applyPatchFile(patchPath) {
  try {
    execFileSync("git", ["apply", patchPath], { cwd: process.cwd(), stdio: "pipe" });
    return "applied";
  } catch {
    return "failed";
  }
}

function readTaskText(args) {
  const text = args._.join(" ").trim();
  if (!text) fail("Missing task text.");
  return text;
}

function changedFilesFromDiff(diff) {
  return diff.split(/\r?\n/).map((line) => line.match(/^\+\+\+ b\/(.+)$/)?.[1]).filter(Boolean);
}

function countDiffLines(diff, prefix) {
  return diff.split(/\r?\n/).filter((line) => line.startsWith(prefix) && !line.startsWith(`${prefix}${prefix}${prefix}`)).length;
}

function statusForCheck(records, kind) {
  return records.find((record) => record.kind === kind)?.status || "not_configured";
}

function estimateCostCents(provider, model, usage) {
  const totalTokens = Number(usage.totalTokens || 0);
  if (!totalTokens) return 0;
  const lower = `${provider}:${model}`.toLowerCase();
  const perMillionCents = lower.includes("opus") ? 1500 : lower.includes("sonnet") ? 300 : 50;
  return Math.max(1, Math.round((totalTokens / 1_000_000) * perMillionCents));
}

async function appendJsonl(file, value) {
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(value)}\n`, "utf8");
}

function parseJsonl(text) {
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function parseYesNo(value, fallback) {
  if (value === undefined || value === null || value === true) return fallback;
  const normalized = String(value).toLowerCase();
  if (["yes", "true", "1", "y"].includes(normalized)) return true;
  if (["no", "false", "0", "n"].includes(normalized)) return false;
  return fallback;
}

function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function ensureSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function ensureTrailingNewline(value) {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
}

function firstLines(text, limit = 4) {
  return String(text || "").split(/\r?\n/).filter(Boolean).slice(0, limit).join(" ");
}

function money(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function printHelp() {
  console.log(`PatchLedger ${version}

Local coding-agent FinOps + quality router.

Usage:
  patchledger <command> [options]

Commands:`);
  for (const [name, description] of Object.entries(commands)) console.log(`  ${name.padEnd(12)} ${description}`);
  console.log(`
Examples:
  patchledger init --test-command "npm test"
  patchledger recommend "write tests for billing retry"
  patchledger run "update README installation steps" --yes
  patchledger result --task task_123 --accepted yes --rework no --tests passed
  patchledger report
`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

main();
