# 01：多轮代码提交与修正

Type: task
Status: resolved
Blocked by: None

## What to build

代码生成在漏交或交错函数体时保留对话并反馈错误，直到模型提交一份符合约定的函数体，或达到默认 10 轮上限。完整行为以[规格](../spec.md)为准。

## Acceptance criteria

- [x] 在公开生成入口接入内部 Harness；消息历史属于本次调用。
- [x] 漏调用追加 user 提醒；JSON / 参数错误及未知工具回填 tool 错误；同轮多个完整调用逐一反馈并要求重交。
- [x] 有效提交立即结束；显式空函数体有效，不读取正文代替提交。
- [x] 默认最多 10 轮，包含首轮；第 10 轮可成功，无第 11 次请求。
- [x] 拒绝、过滤、截断和损坏响应立即失败；保留 SDK 网络错误处理。
- [x] 通过公开入口和模拟 HTTP 的逐次红绿验证覆盖上述行为；保持函数体包装、缓存、eval 与 Jev 行为。
- [x] 每轮仍强制 final_output、关闭并行调用、不添加 strict。

## Implementation notes

使用 tdd；从集成分支开始，完成前合并集成分支最新提交。测试边界已在规格及任务图确认，不重新请求用户确认。暂不暴露轮数配置；下一张工单负责这一完整能力。

## Answer

- 实现提交：`feat(core): add multi-round code generation harness`，工作分支 `codex/harness-generation-loop`。
- `packages/core/harness.js` 维护每次生成的 messages，校验最终提交并回填可修正错误。`generate()` 继续处理 provider 分流、包装和缓存；提示词允许错误后重新提交。
- 红绿证据：先在公开 `generate()` + 真实 SDK / 模拟 HTTP 边界验证漏调用、JSON 错误、字段错误、未知工具、同轮多调用均无法修正；逐次加入处理后对应测试通过。新增损坏响应测试先暴露错误角色等响应被接受，再由结构校验使其直接失败。
- 验证：core 63 / 63、Babel 19 / 19；默认第 10 轮提交成功、耗尽 10 轮后不请求第 11 轮及失败不写缓存均通过；`git diff --check` 通过。未调用真实模型。
- 完成前已合并集成分支最新 tip（`56f2dff`，无额外变更）；实现提交 `5bb7522` 已由合并代理通过 `59a37c2` 集成。轮数配置及使用文档由后续工单完成。
