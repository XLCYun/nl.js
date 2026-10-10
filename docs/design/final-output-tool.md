# 使用 final_output 提交生成代码

状态：四项设计选择已由用户确认，已实现并完成本地验证。

后续的[代码生成 Harness 设计](code-generation-harness.md)将把漏调用及部分提交错误改为多轮反馈修正。该方案尚未实现，本文以下仍描述当前单轮实现。

用户要求在新的 worktree 分支重构生成代码的提交方式：提供 `final_output(output: { asyncFuncBody: string })` 工具，模型必须通过最后的工具调用提交异步函数体。本记录说明确认后的协议和验证范围。

## 已确认的要求

- 工具名为 `final_output`。
- 提交内容包含字符串字段 `asyncFuncBody`，其含义是异步函数内部的代码。
- 提交的是生成代码，代码执行后得到的值称为片段结果；二者不能混用。术语见 [GLOSSARY.md](../../GLOSSARY.md)。
- 在独立 worktree 的 `codex/final-output-tool` 分支工作。起点为当前 `main` 的提交 `763c321`。当时未提交的 Jev 阈值及相关文档修改曾作为本地验证基线，仍保留在本地，不纳入本次 PR。

## 重构背景

- 原 OpenAI 兼容路径使用 Chat Completions，将上下文作为 system/user 消息发送，随后从 `message.content` 提取 `<nl>...</nl>`。
- 原实现提取不到标签时会生成并缓存空函数；新协议区分“有效地提交了空函数体”和“没有按约定提交代码”。
- `generate()` 返回异步立即执行函数的源码字符串，Babel 在调用位置使用 `await eval(await generate(...))` 执行。
- 缓存保存生成代码，以完整原始源码和片段位置为键，不以变量当前值为键。
- Jev 在代码缓存之前独立返回布尔常量表达式，不消费代码生成的提示词和输出正文。
- 首次工具调用响应的 `function.arguments` 已包含提交参数。应用如果以该提交作为生成阶段的终点，无需再次请求模型获取相同代码。

## 已确认的设计选择

| 问题 | 选择 | 状态 |
| --- | --- | --- |
| Q1：修改范围 | 只修改生成代码的输出协议，沿用当前执行、缓存和 Jev 行为 | 已确认 |
| Q2：arguments 结构 | 直接使用 `{ "asyncFuncBody": "return a + b;" }`，`output` 只是整个参数对象的名称 | 已确认 |
| Q3：不合规提交 | 缺少调用、调用多次或参数无效时直接报错，无文本/XML 回退，无额外模型纠错轮次 | 已确认 |
| Q4：服务兼容性 | 使用指定工具调用与关闭并行，不额外要求服务端 `strict: true`；本地严格校验 | 已确认 |

本次不进入更改执行机制或引入模型纠错循环的分支，所有设计问题已解决。

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

运行时要求 `finish_reason` 为 `tool_calls`，且响应不含拒绝信息，再解析唯一一次 `final_output` 函数工具调用的参数。参数必须是合法 JSON 字符串，解析后是只含 `asyncFuncBody` 字符串字段的对象。未知工具、重复调用、额外字段和嵌套的 `output` 对象都会被拒绝。响应正文不参与提取代码；即使截断响应中包含看似完整的参数，也不会执行或缓存。

有效的函数体交给既有异步立即执行函数包装和调用处的 `eval` 执行。函数体原文被保留，并在包装时前后添加换行，避免末尾的单行注释吞掉函数外壳。字符串类型允许空函数体，其片段结果为 `undefined`；这与缺少工具调用不同。该协议校验不保证生成代码语法或行为正确，执行时的语义仍由 JavaScript 决定。

代码生成提示词用 `/* __NLJS_ASYNC_FUNC_BODY__ */` 标出待填函数体，要求最终通过工具提交，说明 `return` 和 `await` 的用法。原始源码、变量当前值和自然语言片段仍作为上下文提供。Jev 继续使用原有 `<nl-judge>` 标记。

协议失败直接抛出 `代码生成失败` 并保留 `cause`，不缓存、不回退到正文，也不追加模型纠错请求。OpenAI SDK 自身的 HTTP 重试策略保持默认，没有新增业务层重试。

服务端 `strict` 控制 JSON Schema 遵循性，不验证字符串内部的 JavaScript。任意 `OPENAI_BASE_URL` 是否支持请求参数需要由服务决定；不支持工具调用的服务不能满足本次要求。

## 验证

准备阶段包含独立 Jev 阈值修改的本地基线为 core 16 项、Babel 19 项测试全部通过；重构后为 core 50 项、Babel 19 项。PR 提交不包含那 4 项阈值测试及其功能，针对实际提交内容重新验证：

- `npm test --prefix packages/core`：46 项通过。新增测试通过模拟 HTTP 检查真实 SDK 请求结构、一次提交后结束、`await`、调用处变量读写、缓存复用、字符串转义、尾部注释和显式空函数体。
- 每个无效响应测试均确认不会追加纠错请求，且下次相同片段仍会请求模型；有效提交之后才复用缓存。覆盖缺少调用、未知工具、多个调用、无效 JSON、字段缺失或类型错误、额外字段、嵌套参数、截断、过滤和拒绝。
- `npm test --prefix packages/babel -- --runInBand`：19 项通过，插件转换保持原样。
- 模拟端到端检查：实际 Babel 编译一个含 `nl` 的函数，运行时通过模拟的 `final_output` 提交函数体，第一次返回 `{ result: 3, count: 1 }`，修改调用参数后返回 `{ result: 30, count: 1 }`，两次执行总计只请求模型一次。
- README 和现有 Jev 设计记录已同步新协议。

真实模型兼容性与生成质量不由模拟测试证明。

## 协议依据

- [OpenAI Chat Completions API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
- [Function calling](https://developers.openai.com/api/docs/guides/function-calling)

当前项目仍使用 Chat Completions，其指定工具写法为 `tool_choice.function.name`，与 Responses 的字段结构不同。
