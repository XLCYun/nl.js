# 04：审查问题修复

Type: task
Status: ready-for-agent
Blocked by: 03

## What to build

修复[审查记录](../review.md)中的全部已确认问题，保留已有调用兼容性，并让多轮消息满足用户批准的完整会话 ID 约束。

## Acceptance criteria

- [ ] 调用公开 generate 时，未提供 global 或 global 为 null，仍能按默认 10 轮生成；显式配置 maxRounds 为 null 仍须失败。
- [ ] 工具调用 ID 在当前会话内非空且唯一，跨轮重复视为损坏响应，立即失败，不把重复调用追加到后续请求中。
- [ ] ID 记录属于本次会话；另一会话使用相同 ID 不会受到影响，包括并发情况。
- [ ] 通过公开入口与模拟 HTTP，先复现两项问题，再逐项修复；调整测试模型的常规响应使用不同调用 ID，保留故意重复的异常样例。
- [ ] 文档准确说明整个会话的 ID 约束，这是项目约定，不声称是未经核实的服务端要求。
- [ ] core 与 Babel 回归通过；工单及审查记录保存修复和验证证据。

## Implementation notes

使用一个实现代理修复全部审查问题，从集成分支创建独立 worktree / 分支；合并最新集成 tip 后报告。不要读取真实 .env 或调用模型。用户已确认测试边界，不新增审批步骤。
