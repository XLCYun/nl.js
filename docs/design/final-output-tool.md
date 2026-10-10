# 使用 final_output 提交生成代码

状态：已实现。生成会话现由[代码生成 Harness](code-generation-harness.md)维护，支持限轮提醒和提交修正。

模型使用 `final_output(output: { asyncFuncBody: string })` 提交异步函数体。参数名 `output` 表示整个对象；实际 arguments 直接包含 `asyncFuncBody`，没有额外的 `output` 层。

工具交付的是生成代码，执行后得到的值称为片段结果；术语见 [GLOSSARY.md](../../GLOSSARY.md)。

## 重构背景

- 原 OpenAI 兼容路径使用 Chat Completions，将上下文作为 system/user 消息发送，随后从 `message.content` 提取 `<nl>...</nl>`。
- 原实现提取不到标签时会生成并缓存空函数；新协议区分“有效地提交了空函数体”和“没有按约定提交代码”。
- `generate()` 返回异步立即执行函数的源码字符串，Babel 在调用位置使用 `await eval(await generate(...))` 执行。
- 缓存保存生成代码，以完整原始源码和片段位置为键，不以变量当前值为键。
- Jev 在代码缓存之前独立返回布尔常量表达式，不消费代码生成的提示词和输出正文。
- 工具调用响应的 `function.arguments` 已包含提交参数。收到有效提交后，无需再次请求模型获取相同代码或总结。

最初的工具协议将所有不合规提交视为立即失败。Harness 保留无文本/XML 回退的约束，将漏调用、JSON 或字段错误、未知工具及同轮多个完整调用改为反馈修正。这样既能让模型纠正提交，也能用轮数上限终止未完成的会话。

## 工具协议

继续使用 Chat Completions，提供如下工具并指定模型必须调用它：

```js
{
  tools: [{
    type: "function",
    function: {
      name: "final_output",
      description: "Submit the final JavaScript async function body and finish code generation.",
      parameters: {
        type: "object",
        properties: {
          asyncFuncBody: {
            type: "string",
            description: "Only the async function body, without an outer function wrapper, Markdown fences or XML wrappers. Use return for the result; await is allowed."
          }
        },
        required: ["asyncFuncBody"],
        additionalProperties: false
      }
    }
  }],
  tool_choice: {
    type: "function",
    function: { name: "final_output" }
  },
  parallel_tool_calls: false
}
```

模型的终结响应示例：

```js
{
  choices: [{
    finish_reason: "tool_calls",
    message: {
      role: "assistant",
      content: null,
      tool_calls: [{
        id: "call_example",
        type: "function",
        function: {
          name: "final_output",
          arguments: "{\"asyncFuncBody\":\"return a + b;\"}"
        }
      }]
    }
  }]
}
```

有效提交要求 `finish_reason` 为 `tool_calls`，且响应不含拒绝信息，再解析该轮唯一一次 `final_output` 函数工具调用的参数。参数必须是合法 JSON 字符串，解析后是只含 `asyncFuncBody` 字符串字段的对象。额外字段和嵌套的 `output` 对象不符合约定。响应正文不参与提取代码；即使截断响应中包含看似完整的参数，也不会执行或缓存。

有效的函数体交给既有异步立即执行函数包装和调用处的 `eval` 执行。函数体原文被保留，并在包装时前后添加换行，避免末尾的单行注释吞掉函数外壳。字符串类型允许空函数体，其片段结果为 `undefined`；这与缺少工具调用不同。该协议校验不保证生成代码语法或行为正确，执行时的语义仍由 JavaScript 决定。

代码生成提示词用 `/* __NLJS_ASYNC_FUNC_BODY__ */` 标出待填函数体，要求最终通过工具提交，说明 `return` 和 `await` 的用法。原始源码、变量当前值和自然语言片段仍作为上下文提供。Jev 继续使用原有 `<nl-judge>` 标记。

服务端 `strict` 控制 JSON Schema 遵循性，不验证字符串内部的 JavaScript。任意 `OPENAI_BASE_URL` 是否支持请求参数需要由服务决定；不支持工具调用的服务不能满足本次要求。

## 多轮修正与终止

每轮请求只提供 `final_output`，强制指定该工具，关闭并行调用，不发送 `strict: true`。Harness 保留收到的 assistant 消息，按以下边界处理响应：

| 情况 | 处理 |
| --- | --- |
| `stop` 正常结束且没有工具调用 | 追加 user 消息，提醒调用 `final_output` 提交函数体 |
| 完整工具调用中的 JSON 无效、字段错误或工具名未知 | 按原调用 ID 回填 tool 错误，允许下一轮修正 |
| 同轮多个完整工具调用，ID 非空且互不重复 | 本轮不采用任何提交，逐个 ID 回填 tool 错误，要求下一轮明确提交一份 |
| 拒绝、内容过滤、响应截断 | 立即失败 |
| 缺少 choice/message、错误角色或工具类型、结束原因不一致等损坏响应 | 立即失败 |
| arguments 本身不是字符串，或调用 ID 缺失、空白、重复 | 无法合法续写，立即失败 |
| 唯一有效提交 | 返回函数体，立即结束会话，不追加模型请求 |

默认上限是 10 轮，包含首轮。通过当前编译文件中的 `__NLJS_GLOBAL.maxRounds` 赋值调整，值必须为正的安全整数；不通过环境变量配置。OpenAI 缓存未命中时读取一次并固定当前会话，Jev 与缓存命中不读取或校验它。完整用法见 [Harness 轮数配置](code-generation-harness.md#轮数配置)。

耗尽轮数时抛出包含最后一次失败原因的 `代码生成失败`，保留 `cause`。可修正的提交不写缓存，终止的生成会话也不写缓存；只有有效函数体进入既有包装和缓存路径。代码的 JavaScript 语法或执行错误继续在调用处暴露，不触发模型修正。OpenAI SDK 自身的 HTTP 重试策略保持默认，不计入会话轮次；Harness 不额外重试网络失败。

## 验证

- `npm test --prefix packages/core`：70 项通过。通过公开生成入口、真实 SDK 和模拟 HTTP 验证请求结构、工具提交、多轮修正、配置与会话隔离、失败不缓存，并覆盖 `await`、调用处变量读写、缓存复用、字符串转义、尾部注释和显式空函数体。
- 默认第 10 轮可成功；耗尽轮数后没有第 11 次模型请求。可修正错误按消息顺序继续，损坏响应与拒绝、截断、过滤立即失败。
- `npm test --prefix packages/babel -- --runInBand`：19 项通过，插件转换保持原样。
- 实际 Babel 编译后，通过模拟 HTTP 验证文件级轮数赋值、修正后 eval 执行和现有缓存路径。

真实模型兼容性与生成质量不由模拟测试证明。

## 协议依据

- [OpenAI Chat Completions API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
- [Function calling](https://developers.openai.com/api/docs/guides/function-calling)

当前项目仍使用 Chat Completions，其指定工具写法为 `tool_choice.function.name`，与 Responses 的字段结构不同。
