# 03：使用说明与协议同步

Type: task
Status: resolved
Blocked by: 02

## What to build

使用者能从 README 与工具协议说明学会配置每个文件的会话上限，并知道提醒、修正、终止和现有执行行为的边界。

## Acceptance criteria

- [x] 文档展示特殊全局对象的 maxRounds 属性赋值，解释默认 10、包含首轮、按文件作用和新生成读取配置。
- [x] 移除当前行为说明中“所有协议错误都立即失败、不会再请求模型”的过时结论，准确描述恢复与致命错误。
- [x] 明确成功的含义是通过提交校验，不保证生成代码语法、行为或真实模型质量；Jev、缓存和 eval 职责不变。
- [x] 完整规格从拟定设计更新为实际行为，历史设计保留必要的来由并指向新机制。
- [x] 核对链接及代码示例，git diff --check 通过；纯文档改动不新增镜像实现的测试。

## Implementation notes

从集成分支开始，完成前合并最新集成提交。tdd 的行为边界由前两张工单覆盖；本工单为文档交付，无需人为制造测试失败。

## Answer

- 实现提交：`docs: explain harness configuration and submission recovery`，工作分支 `codex/harness-user-documentation`。
- README 增加文件级 `__NLJS_GLOBAL.maxRounds` 配置示例，说明默认值、合法范围、会话快照及缓存/Jev 绕过配置的行为，并同步输出协议与 FAQ。
- Harness 设计更新为实际模块职责和验证结果；原 `final_output` 记录保留工具协议来由，更新为当前的限轮修正与终止机制，包括逐调用 ID 反馈、损坏响应失败及成功后不再请求模型。
- 验证：25 个本地链接及锚点存在；10 个 JS/JSON 代码示例语法有效，其中 2 个配置示例经实际 Babel 编译验证注入；`git diff --check` 通过。纯文档变更没有新增或重复运行运行时测试，行为证据沿用工单 01/02 的 core 70 项与 Babel 19 项验证；未加载 `.env` 或请求真实模型。
- 完成前已合并集成分支最新 tip（`1d867a3`，无额外变更）；等待合并代理集成。
