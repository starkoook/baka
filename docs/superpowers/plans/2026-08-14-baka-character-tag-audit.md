# 角色标签审计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Baka TOOLS 实现角色标签审计：清单生成、两阶段审计、决策应用、人数冲突修复、父子合并。

**Architecture:** 新增 `character-tag-audit.js` 和 `character-tag-decisions.js`，复用现有 LLM 调用和角色关系表；前端新增审计对话框和复核窗口。

**Tech Stack:** Electron、Node.js、Vue 3、Vitest、TypeScript。

---

## 文件结构

- Create: `electron/ipc/character-tag-decisions.js`
- Create: `electron/ipc/character-tag-audit.js`
- Create: `electron/ipc/__tests__/character-tag-decisions.spec.ts`
- Create: `electron/ipc/__tests__/character-tag-audit.spec.ts`
- Modify: `electron/preload.js`
- Modify: `electron/ipc/channels.js`
- Modify: `src/env.d.ts`
- Create: `src/components/tagger/CharacterTagAuditDialog.vue`
- Create: `src/components/tagger/CharacterTagAuditReview.vue`
- Modify: `src/views/Tagger.vue`

---

### Task 1: 角色标签决策规则

- [ ] **Step 1: 写失败测试**

测试人数冲突修复和父子合并。

- [ ] **Step 2: 实现 `character-tag-decisions.js`**

```js
function fixSubjectCount(tags) {
  const result = [...tags]
  if (result.includes('solo') && result.some(tag => /^\d+girls?$/.test(tag))) {
    result.splice(result.indexOf('solo'), 1)
  }
  return result
}

function mergeChildTags(tags, parentByChild) {
  return tags.filter(tag => {
    const parent = parentByChild.get(tag.toLowerCase())
    return !parent || !tags.includes(parent)
  })
}

module.exports = { fixSubjectCount, mergeChildTags }
```

- [ ] **Step 3: 运行测试确认通过**

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/character-tag-decisions.js electron/ipc/__tests__/character-tag-decisions.spec.ts
git commit -m "feat: add character tag decisions"
```

---

### Task 2: 审计服务

- [ ] **Step 1: 实现 `character-tag-audit.js`**

提供：

```js
async function buildInventory({ imagePaths, tagsByImage })
async function auditInventory(inventory, options)
async function applyDecisions(decisions)
```

- [ ] **Step 2: 测试清单生成**

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/character-tag-audit.js electron/ipc/__tests__/character-tag-audit.spec.ts
git commit -m "feat: add character tag audit service"
```

---

### Task 3: IPC 与前端

- [ ] **Step 1: 增加通道和 preload API**

```js
CHARACTER_AUDIT_BUILD: 'characterAudit:build',
CHARACTER_AUDIT_RUN: 'characterAudit:run',
CHARACTER_AUDIT_APPLY: 'characterAudit:apply',
```

- [ ] **Step 2: 类型声明**

新增 `CharacterAuditAPI`。

- [ ] **Step 3: 创建审计对话框和复核窗口**

设置触发词、标准图、模式，运行审计，展示决策并批量应用。

- [ ] **Step 4: 运行测试和类型检查**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/preload.js electron/ipc/channels.js src/env.d.ts src/components/tagger/CharacterTagAuditDialog.vue src/components/tagger/CharacterTagAuditReview.vue src/views/Tagger.vue
git commit -m "feat: add character audit ui"
```

---

### Task 4: 集成验证

- [ ] **Step 1: 运行相关测试**

Expected: 全部 PASS

- [ ] **Step 2: 类型检查**

Expected: PASS

- [ ] **Step 3: 手动验收**

- 清单生成正确。
- 决策应用正确。
- 人数冲突修复正确。
- 父子标签合并正确。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: complete character audit verification"
```
