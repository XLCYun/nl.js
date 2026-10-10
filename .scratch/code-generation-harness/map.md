# 代码生成 Harness 任务图

Status: in-progress

集成分支：`codex/code-generation-harness`

基线与审查固定点：`2a4c8f8a34b0f6a6739a7d0246c9df40c693279a`（开始实施时的 `main`）。

规格：[代码生成 Harness](../../docs/design/code-generation-harness.md)。

## 工单依赖

| 工单 | 交付行为 | Blocked by |
| --- | --- | --- |
| [01 多轮代码提交与修正](issues/01-generation-loop.md) | 漏调用或提交格式错误后继续对话，有效提交结束，默认最多 10 轮 | None |
| [02 文件级轮数配置与会话隔离](issues/02-round-configuration.md) | 通过特殊全局对象调整上限，并验证缓存、Jev 与并发会话边界 | 01 |
| [03 使用说明与协议同步](issues/03-user-documentation.md) | 用户能够按文档配置和理解提醒、修正及终止行为 | 02 |

## 跟踪约定

每张工单使用 `Status: ready-for-agent / claimed / resolved`。领取前必须确认全部依赖已 resolved；完成后在工单的 Answer 中记录提交与验证证据。工单完成需要合入上述集成分支，不能仅有工作分支提交。

## 已确认的测试边界

规格中的验证沿用公开 `generate({ global, scope, source })`、真实 SDK 加模拟 HTTP，以及已有 Babel 转换测试。它们验证返回代码、外部请求对话、配置和执行效果；不直接测试私有解析函数，不请求真实模型，也不声称证明模型生成质量。

## Decisions-so-far

- 规格已获实施授权；核心行为、配置入口和失败边界已确定。
- 各实现工单使用独立分支和 worktree，经合并代理集成；最后从固定基线进行 Standards 与 Spec 两项审查。

## Fog

无未决产品设计问题。
