# NL.js

NL.js 尝试探索一种代码与自然语言相融合的编程方式。我们希望自然语言能够直接嵌入代码，参与程序的表达与执行，让编程拥有更多表达意图的可能。

NL.js 是这一想法在 JavaScript 中的实验。通过 `nl` 模板标签嵌入自然语言，由大模型在运行时结合程序上下文，生成并执行对应的代码。

```js
async function main() {
  nl`print "Hello, World!"`;
}

main();
```

项目包含 Babel 插件、运行时和命令行示例。Babel 负责转换 `nl` 模板标签，运行时通过 OpenAI 兼容的 Chat Completions 接口生成 JavaScript，再在调用位置执行。

## 快速开始

下面的命令使用 macOS / Linux 的 Bash 或 Zsh。本文在 Node.js 24、npm 11 环境核对构建流程；运行示例还需要模型服务的 API Key、接口地址和可用模型名称。

### 1. 安装依赖

```bash
git clone https://github.com/XLCYun/nl.js.git
cd nl.js

npm install --prefix packages/core
npm install --prefix packages/babel

cd examples/babel/helloWorld
npm install
```

仓库根目录没有 `package.json`。两个包和每个示例各自管理依赖，示例通过 `file:../../../packages/core` 引用本地运行时。

### 2. 配置模型接口

在同一个终端中设置环境变量，将占位内容替换为实际的 API Key、接口基础地址和可用模型名称。

```bash
export OPENAI_API_KEY='your-api-key'
export OPENAI_BASE_URL='https://your-api-provider.example/v1'
export OPENAI_MODEL='your-model-name'
```

Base URL 应包含服务要求的 API 基础路径，例如 `/v1`。SDK 会自动追加 `/chat/completions`，因此不要把完整的对话接口路径填进 Base URL。具体地址以所用服务的文档为准。

### 3. 编译并运行

继续在 `examples/babel/helloWorld` 目录执行：

```bash
npm run build
node lib/index.js
```

正常情况下会输出：

```text
Hello, World!
```

`npm run build` 将源码 `index.js` 编译为 `lib/index.js`。模型请求发生在运行编译产物时；每次修改示例源码或 Babel 配置后，都需要重新编译。

## 配置与调试

运行时读取以下环境变量：

| 变量 | 用途 | 未设置时的行为 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 模型服务的 API Key | 创建客户端时失败 |
| `OPENAI_BASE_URL` | OpenAI 兼容接口的基础地址 | SDK 使用 `https://api.openai.com/v1` |
| `OPENAI_MODEL` | 请求的模型名称 | 使用 [运行时源码](packages/core/index.js) 中的默认模型 |
| `DEBUG` | 输出调试日志 | 关闭；只有字符串 `true` 会开启 |

默认接口地址和默认模型名称分别来自 SDK 和本项目。请显式设置 `OPENAI_BASE_URL`、`OPENAI_MODEL`，确保它们属于同一个服务且模型支持 Chat Completions。

在示例目录中开启调试：

```bash
DEBUG=true node lib/index.js
```

日志包含 `prompt:`、`response from LLM`、`generated code`。命中代码缓存时会输出 `cached code found`。

项目不会自动加载 `.env`。如果希望通过文件配置，可以在当前示例目录创建 `.env`：

```dotenv
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://your-api-provider.example/v1
OPENAI_MODEL=your-model-name
DEBUG=true
```

然后使用 Node.js 的环境文件参数运行：

```bash
node --env-file=.env lib/index.js
```

`.env` 路径相对于执行命令的目录；同名变量已经存在于终端环境中时，以终端中的值为准。

## 示例

所有示例都是命令行程序，位于 `examples/babel/`。运行一个新示例时，进入其目录安装依赖并编译。例如，以下命令从仓库根目录运行：

```bash
cd examples/babel/eightQueen
npm install
npm run build
DEBUG=true node lib/index.js
```

下表的运行命令都在对应示例目录中执行，并假定已经完成安装、接口配置和编译。

| 示例 | 内容 | 运行命令 |
| --- | --- | --- |
| [helloWorld](examples/babel/helloWorld) | 用自然语言输出 Hello World | `node lib/index.js` |
| [eightQueen](examples/babel/eightQueen) | 用自然语言描述棋盘操作和判断，递归求解八皇后问题 | `node lib/index.js` |
| [asyncSleep](examples/babel/asyncSleep) | 从参数读取秒数，异步等待并逐秒输出 | `node lib/index.js 3` |
| [computer](examples/babel/computer) | 根据自然语言参数进行数学计算 | `node lib/index.js "计算 123 加 456"` |
| [multiLangRoshambo](examples/babel/multiLangRoshambo) | 读取石头剪刀布选项，用相同语言输出能获胜的选项 | `node lib/index.js "石头"` |
| [nlarg](examples/babel/nlarg) | 根据描述生成命令参数，包含交互确认和执行步骤 | `node lib/index.js ls "list all files including hidden files"` |
| [planner](examples/babel/planner) | 将任务拆成待办，逐项输出并标记完成 | `node lib/index.js "clean the house"` |
| [react](examples/babel/react) | ReAct 风格的任务循环，通过终端输入提供行动观察 | `node lib/index.js "帮我规划一次周末旅行"` |
| [metaAgent](examples/babel/metaAgent) | 根据任务生成 Agent 描述、提示词和工具名列表 | `node lib/index.js "获取网页内容并转换为大写"` |

`planner` 通过打印下一步操作来模拟执行；`react` 等待用户输入观察结果；`metaAgent` 输出 Agent 配置，其 `httpGet` 工具只是返回 URL。`nlarg` 的执行步骤会运行实际系统命令。

八皇后示例成功时，输出类似下面的棋盘。具体解和日志会随生成的代码变化：

```text
Found a solution!
Q . . . . . . .
. . . . Q . . .
. . . . . . . Q
. . . . . Q . .
. . Q . . . . .
. . . . . . Q .
. Q . . . . . .
. . . Q . . . .
```

## 工作原理

1. **编译**：`@nljs/babel` 找到 `nl` 模板标签，注入 `@nljs/core`，记录原始源码、片段位置和可收集的作用域变量，将标签转换为包含 `await` 的生成与执行调用。
2. **生成**：运行到该位置时，`@nljs/core` 先检查缓存；未命中时，将源码上下文和作用域变量的 JSON 值发送给模型，要求返回由 `<nl>...</nl>` 包裹的 JavaScript。
3. **执行**：运行时提取代码，包装为异步函数表达式，并在原调用位置通过 `await eval(...)` 执行。生成代码可以读取调用处的变量，也可以返回值供后续代码使用。

编译本身不调用模型。`lib/index.js` 包含运行时生成代码的调用，模型生成的代码不会写回这个文件。

### 编写自己的示例

可以沿用 `helloWorld` 的 `package.json` 和 `babel.config.js`，在 `examples/babel/` 下新建同级目录。Babel 配置引用本地插件：

```js
module.exports = {
  plugins: [require('../../../packages/babel')]
};
```

在 `index.js` 中将 `nl` 表达式放进 `async` 函数。例如：

```js
async function main() {
  const numbers = [1, 2, 3, 4];
  const total = nl`return the sum of numbers`;
  console.log(total);
}

main().catch(console.error);
```

不需要定义或导入 `nl` 函数，插件会处理这个标签。插件插入 `await`，因此调用位置必须允许使用 `await`。完成后，在新示例目录运行 `npm install`、`npm run build`、`node lib/index.js`。

## 代码缓存

**缓存默认开启**。首次生成代码后，同一个自然语言片段再次执行时会复用生成的代码。

| 项目 | 当前行为 |
| --- | --- |
| 缓存内容 | 生成的 JavaScript 代码；每次命中后仍然执行这段代码 |
| 缓存位置 | 当前 Node.js 进程内的 `Map` |
| 缓存键 | 完整源码 + 片段起始位置 + 片段结束位置 |
| 作用域变量变化 | 不影响缓存键 |
| 生命周期 | 进程退出后清空，不会跨次运行保存到磁盘 |
| 启用方式 | 默认开启，无需设置环境变量 |

因此，相同文本出现在不同源码位置时会分别缓存。需要每轮根据新状态重新生成代码的场景，可以通过运行时 API 关闭缓存：

```js
const { disableCodeCache } = require('@nljs/core');
disableCodeCache();
```

`metaAgent` 和 `react` 示例已经通过插件注入的运行时对象关闭缓存：

```js
__NLJS_CORE.disableCodeCache();
```

要让它们使用缓存，删除源码中的这行调用，重新编译并启动程序。目前没有运行中重新启用缓存的 API，也没有 `CACHE=true` 这样的配置开关。

使用 `DEBUG=true` 可以通过 `cached code found` 日志确认是否命中缓存。

## 常见问题

### `nl is not defined` 或 `__NLJS_CORE is not defined`

通常是直接执行了未编译的源码。进入示例目录，先编译，再运行产物：

```bash
npm run build
node lib/index.js
```

如果日志中的源码和当前 `index.js` 不一致，也需要重新编译，更新旧的 `lib/index.js`。

### `Cannot read properties of undefined (reading '0')`

当前运行时直接读取 `completion.choices[0]`。这个错误表示接口返回的数据缺少预期的 `choices` 字段，需要检查接口地址及返回格式。

例如，Base URL 遗漏服务要求的 API 路径时，某些服务会返回 HTTP 200 的 HTML 网页。SDK 收到网页内容后，运行时仍尝试读取 `choices[0]`，就会出现这个错误。

确认 Base URL 包含正确的 API 基础路径，再检查响应是否为 Chat Completions 格式的 JSON。服务返回错误对象或其他协议的数据时，也可能出现相同问题。

### 找不到 `@nljs/core`、`openai` 或 `@babel/template`

需要分别安装本地包和所运行示例的依赖。以下命令从仓库根目录运行，以 `helloWorld` 为例：

```bash
npm install --prefix packages/core
npm install --prefix packages/babel
npm install --prefix examples/babel/helloWorld
```

### 修改了配置，但运行时没有变化

环境变量应在运行示例的同一个终端设置；仅创建 `.env` 不会自动生效，需使用 `node --env-file=.env lib/index.js`。如果终端已设置同名变量，它会覆盖环境文件中的值。

### 输出为空、返回 `undefined` 或生成代码执行失败

开启 `DEBUG=true`，查看 `response from LLM` 和 `generated code`。当前解析器要求模型返回 `<nl>...</nl>` 标签中的代码；缺少标签时会生成空函数。自然语言描述、模型返回值和生成代码都可能影响结果，可先用 `helloWorld` 验证接口链路。

## 项目结构与开发

```text
packages/
  babel/               Babel 插件与 Jest 测试
    helpers/           作用域变量收集、注入检查
  core/                模型请求、上下文组装、代码解析与缓存
examples/
  babel/               各自独立安装、编译和运行的命令行示例
```

从仓库根目录运行已有的 Babel 插件测试：

```bash
npm test --prefix packages/babel -- --runInBand
```

测试覆盖插件转换和作用域变量收集，不调用模型接口。`packages/core` 当前的 `test` 脚本仍是占位命令，尚无可运行的自动化测试。

当前实现的边界：

- 生成的代码通过 `eval` 在当前 Node.js 进程中执行，没有沙箱隔离。
- 模型请求会携带源码上下文和收集到的作用域变量值；调试日志也会输出这些内容。
- 作用域变量使用 `JSON.stringify` 序列化，循环引用、BigInt 等无法直接序列化的值需要由调用方处理。
- 模型输出直接影响程序行为；目前没有生成代码的静态校验，也没有持久化缓存。
