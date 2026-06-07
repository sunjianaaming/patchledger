# PatchLedger Tester Guide

PatchLedger is a local coding-agent FinOps + quality router.

Do not send API keys, private prompts, source code, `.patchledger/config.json`, or `.patchledger/runs/` back to the project author.

## 1. Local Router Smoke Test

```bash
node bin/patchledger.mjs init
node bin/patchledger.mjs doctor
node bin/patchledger.mjs recommend "update README installation steps"
```

Expected:

- `init` creates `.patchledger/config.json` and `.patchledger/policy.json`.
- `doctor` shows OpenAI/Anthropic key availability.
- `recommend` prints task type, risk level, selected tier/model, and rationale.

## 2. Real Provider Test

Set one or both provider keys:

```bash
export OPENAI_API_KEY=your-openai-key
export ANTHROPIC_API_KEY=your-anthropic-key
```

Run a low-risk task:

```bash
node bin/patchledger.mjs run "update README installation steps" --yes
```

Then record the outcome:

```bash
node bin/patchledger.mjs result --task TASK_ID --accepted yes --rework no --tests passed
```

Finally:

```bash
node bin/patchledger.mjs report
```

## 3. Automated Tests

If npm is available:

```bash
npm test
```

If npm is not available:

```bash
node --test tests/*.test.mjs
node --check bin/patchledger.mjs
```