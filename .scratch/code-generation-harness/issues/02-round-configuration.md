# 02：文件级轮数配置与会话隔离

Type: task
Status: resolved
Blocked by: 01

## What to build

用户在自然语言片段执行前为特殊全局对象的 maxRounds 属性赋值，即可调整该文件后续新生成的轮数上限。不同生成会话彼此独立。完整契约以[规格](../spec.md)为准。

## Acceptance criteria

- [x] 默认 10，支持正的安全整数；非法值在请求前失败，不新增环境变量或公共配置方法。
- [x] 每次 OpenAI 缓存未命中时读取配置，当前会话固定使用该快照；下一次新生成可读取新值。
- [x] Jev 与代码缓存命中忽略轮数配置，包括无效值。
- [x] 生成阶段失败不缓存，修正成功后仍复用生成代码。
- [x] 并发生成历史和配置不会互相污染；原始上下文在当前会话固定。
- [x] 使用公开生成接口和模拟 HTTP 逐次红绿验证；已有 Babel 测试通过，必要时验证编译后的配置赋值可到达 core。

## Implementation notes

使用 tdd；确认 01 已合入集成分支并 resolved 后领取，从集成分支开始，完成前合并集成分支最新提交。不得读取实际 .env 或调用真实模型。

## Answer

- 实现提交：`feat(core): configure generation round limits per file`，工作分支 `codex/harness-round-configuration`。
- `generate()` 在 OpenAI 代码缓存未命中后读取一次 `global.maxRounds`；仅 `undefined` 使用默认 10，其他值必须是正的安全整数，再将数值快照交给 Harness。配置错误在请求前失败，Jev 与代码缓存命中保持原路径。
- 红绿证据：`maxRounds = 1` 的公开生成测试先观察到 10 次请求，接入配置后按 1 / 3 轮停止；无效类型测试先因 `null` 未报错而失败，加入严格校验后所有无效值均在 HTTP 请求前失败。
- 回归验证覆盖：安全整数边界；运行中修改配置、模型和上下文不改变当前会话，下一次生成读取新值；耗尽后可重新生成，修正成功后的缓存绕过无效配置；Jev 忽略无效配置；并发生成历史、模型和轮数上限隔离。
- 验证：core 70 / 70、Babel 19 / 19，`git diff --check` 通过。真实 Babel 编译后的 `__NLJS_GLOBAL.maxRounds` 赋值已通过模拟 HTTP 冒烟验证：1 轮停止，2 轮修正后 eval 得到 41。没有真实模型请求，也未修改 Babel 生产代码。
- 完成前已确认并合并集成分支最新 tip（`59a37c2`，无额外变更）；等待合并代理将本工单集成。README 与协议说明由工单 03 同步。
