# CLI 示例

用 `nljs` 直接运行 JavaScript。这里提供了 Babel 目录中全部 9 个非 Jev 示例的 CLI 版本，共用一份模型配置，无需安装示例依赖或手动编译。

需要 Node.js 22.x ≥22.18.0 或 24+，以及支持工具调用的 OpenAI 兼容 Chat Completions 服务。以下命令均在仓库根目录执行。

## 配置一次

复制配置模板；`-n` 会保留已有配置：

```bash
cp -n examples/cli/config.example.cjs examples/cli/config.cjs
```

在 `config.cjs` 中填写 `apiKey`、`baseURL`、`model`，保持 `provider: 'openai'`。每个脚本都会显式加载这份配置；NL.js 不自动读取 `.env`。`config.cjs` 已被 Git 忽略。

## 运行示例

| 示例 | 内容 | 命令 |
| --- | --- | --- |
| [helloWorld.js](helloWorld.js) | 用自然语言打印 Hello World | `npx @nljs/cli examples/cli/helloWorld.js` |
| [asyncSleep.js](asyncSleep.js) | 按指定秒数异步等待，逐秒输出 | `npx @nljs/cli examples/cli/asyncSleep.js 3` |
| [computer.js](computer.js) | 根据自然语言参数计算结果 | `npx @nljs/cli examples/cli/computer.js "计算 123 加 456"` |
| [eightQueen.js](eightQueen.js) | 用自然语言描述棋盘操作和判断，递归求解八皇后 | `npx @nljs/cli examples/cli/eightQueen.js` |
| [multiLangRoshambo.js](multiLangRoshambo.js) | 用输入所用的语言给出能获胜的石头剪刀布选项 | `npx @nljs/cli examples/cli/multiLangRoshambo.js "石头"` |
| [nlarg.js](nlarg.js) | 生成命令参数，询问确认后执行 | `npx @nljs/cli examples/cli/nlarg.js ls "list all files including hidden files"` |
| [planner.js](planner.js) | 将任务拆成待办，逐项打印并标记完成 | `npx @nljs/cli examples/cli/planner.js "clean the house"` |
| [react.js](react.js) | ReAct 风格的任务循环，通过终端输入提供观察结果 | `npx @nljs/cli examples/cli/react.js "帮我规划一次周末旅行"` |
| [metaAgent.js](metaAgent.js) | 根据任务生成 Agent 描述、提示词和工具名列表 | `npx @nljs/cli examples/cli/metaAgent.js "获取网页内容并转换为大写"` |

原有的 [hello.js](hello.js) 也可继续使用：`npx @nljs/cli examples/cli/hello.js "NL.js"`，默认名字为 `World`。

`planner` 通过打印来模拟执行任务；`react` 等待用户输入观察结果；`metaAgent` 输出 Agent 配置，其 `httpGet` 工具只返回 URL。`nlarg` 确认后的执行步骤会运行实际系统命令。

`react` 和 `metaAgent` 沿用 Babel 版本的 `__NLJS_CORE.disableCodeCache()`，每次按当前上下文重新生成代码。其他示例默认复用进程内的生成代码。查看请求与生成代码时，可在配置中设置 `debug: true`。

Jev 示例保留在 [Babel 目录](../babel)，配置及完整用法见[使用指南](../../docs/guide.md)。
