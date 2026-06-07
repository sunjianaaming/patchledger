# PatchLedger

PatchLedger is a local command-line tool for testing model routing in coding tasks.

It helps answer one practical question:

```text
Can a cheaper model finish this coding task without causing rework?
```

PatchLedger runs on your own computer. Your API keys stay in your Terminal session and are not written into the project files.

## What You Need

- A Mac, Linux, or Windows computer.
- Node.js installed.
- An OpenAI API key.
- Optional: an Anthropic API key for Claude models.

If you do not have Node.js, install the LTS version from:

```text
https://nodejs.org/
```

Important: a ChatGPT Plus/Pro subscription is not the same as OpenAI API credit. If you see a quota error, check your OpenAI Platform billing.

## Quickstart

### 1. Download PatchLedger

Download this project from GitHub, then unzip it.

Open Terminal and go into the project folder:

```bash
cd path/to/patchledger
```

If your folder is on the Desktop, it may look like this:

```bash
cd ~/Desktop/patchledger
```

### 2. Check That Node.js Works

Run:

```bash
node --version
```

If you see a version number, Node.js is ready.

Example:

```text
v22.0.0
```

### 3. Create Local PatchLedger Config

Run:

```bash
node bin/patchledger.mjs init --test-command "node --version"
```

This creates a local `.patchledger/` folder on your computer.

### 4. Add Your API Key

For OpenAI:

```bash
export OPENAI_API_KEY='paste-your-openai-api-key-here'
```

Optional, for Anthropic / Claude:

```bash
export ANTHROPIC_API_KEY='paste-your-anthropic-api-key-here'
```

Use straight quotes like `'...'`, not curly quotes.

PatchLedger currently supports OpenAI and Anthropic provider API keys. A Claude Code subscription alone is not enough; you need an Anthropic API key if you want to test Claude models.

### 5. Check Setup

Run:

```bash
node bin/patchledger.mjs doctor
```

This command checks whether PatchLedger can see your local config and API keys. It does not spend tokens.

You should see something like:

```text
PatchLedger Router doctor
- Config: found
- Policy: found
- OpenAI key: available
- Anthropic key: missing
```

`Anthropic key: missing` is okay if you only want to test OpenAI first.

### 6. Run One Small Test Task

Stay in the same Terminal window and run:

```bash
node bin/patchledger.mjs run "update README installation steps" --yes
```

PatchLedger will:

- classify the task;
- choose a model;
- ask the model for a code patch;
- try to apply the patch locally;
- record cost and quality data under `.patchledger/`.

### 7. Send Feedback

Please send back:

- the full Terminal output;
- whether the command was easy or confusing;
- whether the task result was useful;
- any error message you saw.

## Common Errors

### `node: command not found`

Node.js is not installed, or Terminal cannot find it.

Install Node.js from:

```text
https://nodejs.org/
```

Then close Terminal, open it again, and retry:

```bash
node --version
```

### `OpenAI key: missing`

The API key was not added in this Terminal window.

Run:

```bash
export OPENAI_API_KEY='paste-your-openai-api-key-here'
```

Then run:

```bash
node bin/patchledger.mjs doctor
```

### `Provider request failed: 401`

The API key is invalid, expired, copied incorrectly, or belongs to the wrong provider.

Create a new OpenAI API key from:

```text
https://platform.openai.com/api-keys
```

### `Provider request failed: 429`

Your OpenAI Platform account or project does not have available API quota.

Check billing here:

```text
https://platform.openai.com/account/billing/overview
```

ChatGPT Plus/Pro does not automatically include API credit.

### `fetch failed`

This is usually a network issue.

If you are outside a restricted network, you normally do not need a proxy. If you are using a company network, VPN, or local proxy, try a different network or ask the project owner for help.

## Useful Commands

Recommend a model without changing files:

```bash
node bin/patchledger.mjs recommend "write tests for billing retry"
```

Record whether the result was accepted:

```bash
node bin/patchledger.mjs result --task task_123 --accepted yes --rework no --tests passed
```

Show a local report:

```bash
node bin/patchledger.mjs report
```

## Data And Privacy

PatchLedger stores local run data in:

```text
.patchledger/
```

Do not upload `.patchledger/` to GitHub.

PatchLedger does not save your OpenAI or Anthropic API key into the project config.

## Current Scope

Supported in this version:

- OpenAI API;
- Anthropic API;
- local JSON/JSONL records;
- task routing;
- local patch application;
- local cost and quality reports.

Not supported yet:

- Gemini;
- Qwen;
- Ollama;
- dashboard UI;
- Claude Code subscription adapter;
- Codex subscription adapter.

## License

MIT.
