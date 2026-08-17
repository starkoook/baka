# LoRA Training Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local model selection, trainer repository discovery, preflight validation, and backend readiness reliable before a LoRA task is submitted.

**Architecture:** Put reusable training-input and readiness rules in a small TypeScript module, and repository discovery in a small CommonJS module consumed by Electron. Keep `TrainingTask.vue` responsible for UI messages and orchestration while delegating deterministic decisions to tested helpers.

**Tech Stack:** Vue 3, TypeScript, Electron CommonJS, Vitest

---

### Task 1: Training input and readiness helpers

**Files:**
- Create: `src/features/training/training-readiness.ts`
- Create: `src/features/training/__tests__/training-readiness.spec.ts`

- [x] **Step 1: Write failing tests** for local-model priority, missing path detection, and backend readiness retries.
- [x] **Step 2: Run** `npm.cmd test -- src/features/training/__tests__/training-readiness.spec.ts` and confirm failure because the module does not exist.
- [x] **Step 3: Implement** `resolveTrainingModel`, `validateTrainingInputs`, and `waitForTrainingBackend` with only the behavior required by the tests.
- [x] **Step 4: Re-run** the focused test and confirm it passes.

### Task 2: Trainer repository selection

**Files:**
- Create: `electron/runtime/repo-selector.js`
- Create: `electron/ipc/__tests__/repo-selector.spec.ts`
- Modify: `electron/ipc/runtime-manager.js`

- [x] **Step 1: Write failing tests** proving that a valid configured path wins, the local reference wins over bundled fallback, and invalid candidates are skipped.
- [x] **Step 2: Run** `npm.cmd test -- electron/ipc/__tests__/repo-selector.spec.ts` and confirm failure because the selector does not exist.
- [x] **Step 3: Implement** the selector and use it from `getRepoRoot()` with configured, reference, bundled, and downloaded candidates in that order.
- [x] **Step 4: Re-run** repository and runtime-manager tests and confirm they pass.

### Task 3: Integrate reliable preflight into the training page

**Files:**
- Modify: `src/views/TrainingTask.vue`
- Modify: `electron/ipc/__tests__/training-route.spec.ts`

- [x] **Step 1: Add failing source-contract tests** proving the page uses the effective model, launches a known installed runtime, calls the readiness poller, and no longer uses a fixed two-second delay.
- [x] **Step 2: Run** `npm.cmd test -- electron/ipc/__tests__/training-route.spec.ts` and confirm the new assertions fail.
- [x] **Step 3: Update the page** so presets clear stale local models, local input takes priority, filesystem/runtime checks happen before configuration backup, an installed runtime is selected explicitly, and backend status is polled before backend preflight.
- [x] **Step 4: Re-run** the focused tests and confirm they pass.

### Task 4: Full verification

**Files:**
- No production files beyond Tasks 1-3.

- [x] **Step 1: Run** `npm.cmd test` and confirm all tests pass.
- [x] **Step 2: Run** `npm.cmd run typecheck` and confirm there are no TypeScript errors.
- [x] **Step 3: Run** `npm.cmd run build` and confirm the renderer build completes.
- [x] **Step 4: Inspect** `git diff --` for only the planned training reliability changes and preserve unrelated user changes.
