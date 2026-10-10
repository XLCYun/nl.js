# 04：审查问题修复

Type: task
Status: resolved
Blocked by: 03

## What to build

修复[审查记录](../review.md)中的全部已确认问题，保留已有调用兼容性，并让多轮消息满足用户批准的完整会话 ID 约束。

## Acceptance criteria

- [x] 调用公开 generate 时，未提供 global 或 global 为 null，仍能按默认 10 轮生成；显式配置 maxRounds 为 null 仍须失败。
- [x] 工具调用 ID 在当前会话内非空且唯一，跨轮重复视为损坏响应，立即失败，不把重复调用追加到后续请求中。
- [x] ID 记录属于本次会话；另一会话使用相同 ID 不会受到影响，包括并发情况。
- [x] 通过公开入口与模拟 HTTP，先复现两项问题，再逐项修复；调整测试模型的常规响应使用不同调用 ID，保留故意重复的异常样例。
- [x] 文档准确说明整个会话的 ID 约束，这是项目约定，不声称是未经核实的服务端要求。
- [x] core 与 Babel 回归通过；工单及审查记录保存修复和验证证据。

## Implementation notes

使用一个实现代理修复全部审查问题，从集成分支创建独立 worktree / 分支；合并最新集成 tip 后报告。不要读取真实 .env 或调用模型。用户已确认测试边界，不新增审批步骤。

## Answer

- 工作分支：`codex/harness-review-fixes`，从集成分支 `50a65ec` 开始；修复提交 `5bcbe2b`（`fix(core): preserve generation defaults and conversation call IDs`）已由合并代理通过 `f3ac640` 无冲突集成，合并树与已验证的实现树一致。
- 兼容性红绿证据：新增公开生成测试在未传 `global` 时先失败于 `Cannot read properties of undefined (reading 'maxRounds')`；改为 `global?.maxRounds` 后，省略与 `null` 两种调用均可在默认第 10 轮得到结果 7。既有无效配置测试继续验证显式 `maxRounds: null` 在任何 HTTP 请求前失败。
- ID 约束红绿证据：连续两轮使用 `call_reused` 的测试先出现 `Missing expected rejection`，表明旧实现继续接受会话。将 ID 集合移动到每次 `runCodeGeneration()` 内后，第 2 轮立即因重复 ID 失败，没有第 3 次请求；重复 ID 携带无效 JSON 或有效函数体都失败，所有实际发出的历史均无重复调用。
- 正常模拟提交改用独立 ID；同轮重复 ID 的损坏响应样例保留。新增回归通过两次独立生成与两次并发生成复用相同 ID，验证 ID 状态不会跨会话泄漏。
- 设计文档恢复原批准规格的整个会话唯一性约束，并明确其属于项目约定；记录可省略 `global` 的兼容性与最新测试总数。
- 验证：`npm test --prefix packages/core` 73 / 73，`npm test --prefix packages/babel -- --runInBand` 19 / 19；定向兼容性与 ID 回归、`git diff --check` 均通过。没有读取真实 `.env` 或请求真实模型。
- 原规格审查者定向复核 `50a65ec...5bcbe2b`，确认两项修复及文档符合批准规格，无可操作遗留问题。
