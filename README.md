# NL.js

NL.js 尝试探索一种代码与自然语言相融合的编程方式。我们希望自然语言能够直接嵌入代码，参与程序的表达与执行，让编程拥有更多表达意图的可能。

NL.js 是这一想法在 JavaScript 中的实验。通过 `nl` 模板标签嵌入自然语言，由大模型在运行时结合程序上下文，生成并执行对应的代码。

```js
async function main() {
  nl`print "Hello, World!"`;
}

main();
```

项目包含 `nljs` 命令、Babel 插件和运行时。`nljs` 在加载脚本时自动转换 `nl` 模板标签，无需配置 Babel 或手动编译。运行时默认通过 OpenAI 兼容的 Chat Completions 接口生成 JavaScript，要求模型调用 `final_output` 工具提交异步函数体，再在调用位置执行。设置 `NLJS_PROVIDER=jev` 后，`nl` 片段改为通过 TypeSafe 的 Jev 模型判断条件，返回布尔值。

## 快速开始

`nljs` 需要 **Node.js 24 或更新版本**。下面的命令使用 macOS / Linux 的 Bash 或 Zsh，在 Node.js 24、npm 11 环境验证。运行自然语言片段还需要模型服务的 API Key、接口地址和可用模型名称。

### 1. 从源码打包并安装 CLI

当前 `@nljs/cli` 尚未发布到 npm，先从仓库生成 tarball，再安装：

```bash
git clone https://github.com/XLCYun/nl.js.git
cd nl.js/packages/cli
npm ci
npm pack
npm install --global ./nljs-cli-0.0.1.tgz

nljs --version
```

`npm pack` 会自动构建，把本仓库的插件和运行时一起打进包。只需安装 `packages/cli` 的依赖，不需要分别安装 `packages/core` 或 `packages/babel`。生成的 tarball 可以复制到仓库之外安装；安装后 `nljs` 不依赖仓库目录。全局安装位置由 npm 配置决定，请确保其命令目录在 `PATH` 中。

未来发布到 npm 后才可使用 `npx @nljs/cli hello.js`；现在请使用上面的 tarball 安装方式。

### 2. 配置模型服务

继续进入单脚本示例目录，并复制配置模板：

```bash
cd ../../examples/cli
cp .env.example .env
```

在 `.env` 中填写支持工具调用的 OpenAI 兼容服务：

```dotenv
NLJS_PROVIDER=openai
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://your-api-provider.example/v1
OPENAI_MODEL=your-model-name
DEBUG=false
```

Base URL 应包含服务要求的 API 基础路径，例如 `/v1`，不要填写完整的 `/chat/completions` 路径。服务必须支持 `final_output` 工具调用，详细要求见下文「配置与调试」。

### 3. 直接运行 JS 脚本

示例 [hello.js](examples/cli/hello.js) 不需要 `package.json`、Babel 配置，也不需要定义或导入 `nl`：

```js
async function main() {
  const name = process.argv[2] || 'World';
  const greeting = nl`返回字符串 "Hello, " + name + "!"`;
  console.log(greeting);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

在该目录运行：

```bash
nljs hello.js
nljs hello.js "NL.js"
```

正常输出分别为 `Hello, World!` 和 `Hello, NL.js!`。也可以将这个脚本与 `.env` 复制到任意目录，再在那里运行同一命令。加载时的转换发生在内存中，不生成 `lib/` 等编译产物；模型请求在执行到自然语言片段时发生。

### 命令、模块与运行目录

```bash
nljs --help
nljs --version
nljs "my script.js" "参数中可以有空格" --flag
nljs -- -script.cjs
```

`nljs <script> [args...]` 将脚本路径之后的参数原样交给脚本，脚本从 `process.argv[2]` 开始读取。`--` 可以结束 CLI 选项，运行以 `-` 开头的文件名。帮助和版本命令无需模型配置。

- 支持 `.js`、`.cjs`、`.mjs`，模块模式遵循 Node.js 的规则。`.cjs` 使用 CommonJS，`.mjs` 使用 ESM；`.js` 根据所在包的 `type` 和 Node.js 的模块识别规则加载。
- 转换会在片段调用处插入 `await`。CommonJS 中的 `nl` 必须放在 `async` 函数内；ESM 可以在模块顶层使用，普通同步函数内仍需改为 `async`。例如将下方代码保存为 `sum.mjs` 后运行 `nljs sum.mjs`。
- 本地 `require`、静态 `import` 和动态 `import()` 加载的 JS 模块也会转换；相对路径仍相对于当前模块解析。`node_modules` 中的依赖默认不转换。脚本自己的第三方依赖仍需安装在该项目中，CLI 只负责提供自身需要的插件和运行时。
- CLI 读取**启动命令时当前工作目录**的 `.env`，不会切换到脚本目录；终端已导出的同名变量优先。比如从仓库根目录执行 `nljs examples/cli/hello.js`，读取的是根目录的 `.env`。文件操作使用的 `process.cwd()`、模块路径和入口身份保持 Node.js 的行为。
- CLI 忽略用户的 Babel 配置，仅执行内置的 `nl` 转换；当前入口不支持 TypeScript 或 JSX。

```js
const numbers = [1, 2, 3, 4];
const total = nl`返回 numbers 中所有数字的总和`;
console.log(total);
```

## Babel 集成方式

已有项目可以继续通过 Babel 插件编译后执行。以下流程从仓库根目录开始；与 `nljs` 的自动转换方式二选一即可。

### 1. 安装依赖

```bash
npm install --prefix packages/core
npm install --prefix packages/babel

cd examples/babel/helloWorld
npm install
```

仓库根目录没有 `package.json`。两个包和每个示例各自管理依赖，示例通过 `file:../../../packages/core` 引用本地运行时。

### 2. 填写示例的 `.env`

每个示例目录都提供 `.env.example`。首次使用时复制为 `.env`；如果已有 `.env`，直接编辑即可：

```bash
cp .env.example .env
```

填写 OpenAI 兼容服务的 API Key、接口基础地址和可用模型名称：

```dotenv
NLJS_PROVIDER=openai
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://your-api-provider.example/v1
OPENAI_MODEL=your-model-name
DEBUG=false
```

Base URL 应包含服务要求的 API 基础路径，例如 `/v1`。SDK 会自动追加 `/chat/completions`，因此不要把完整的对话接口路径填进 Base URL。具体地址以所用服务的文档为准。

### 3. 运行

继续在 `examples/babel/helloWorld` 目录执行：

```bash
npm start
```

正常情况下会输出：

```text
Hello, World!
```

`npm start` 会先通过 `prestart` 执行编译，再用 `node -r dotenv/config lib/index.js` 加载当前示例的 `.env` 并运行。修改源码后重新运行即可；模型请求发生在运行阶段。需要只编译时，仍可使用 `npm run build`。

## 配置与调试

运行时读取以下环境变量：

| 变量 | 用途 | 未设置时的行为 |
| --- | --- | --- |
| `NLJS_PROVIDER` | `openai` 生成代码，`jev` 判断条件 | `openai` |
| `NLJS_JEV_THRESHOLD` | Jev 返回 `true` 的概率下限，范围 `[0, 1]`，配置后按 `p >= 阈值` 判断 | 保留 `p > 0.5` |
| `OPENAI_API_KEY` | OpenAI 兼容服务的 API Key | 使用 `openai` 时创建客户端失败 |
| `OPENAI_BASE_URL` | OpenAI 兼容接口的基础地址 | SDK 使用 `https://api.openai.com/v1` |
| `OPENAI_MODEL` | 请求的模型名称 | 使用 [运行时源码](packages/core/index.js) 中的默认模型 |
| `TYPESAFE_API_KEY` | TypeSafe API Key | 使用 `jev` 时创建客户端失败 |
| `TYPESAFE_BASE_URL` | TypeSafe API 根地址，不包含 `/v1` | `https://api.typesafe.ai` |
| `TYPESAFE_DEFAULT_MODEL` | Jev 模型名称 | `jev-latest` |
| `DEBUG` | 输出调试日志 | 关闭；只有字符串 `true` 会开启 |

使用 `openai` 模式时，默认接口地址和默认模型名称分别来自 SDK 和本项目。请显式设置 `OPENAI_BASE_URL`、`OPENAI_MODEL`，确保它们属于同一个服务且支持 Chat Completions 工具调用，包括指定 `tool_choice` 和 `parallel_tool_calls: false`。本项目不要求服务支持 `strict: true`，工具参数由运行时校验；仅支持文本回复的模型无法用于此路径。

使用 CLI 时，在启动目录开启调试：

```bash
DEBUG=true nljs hello.js
```

使用 Babel 示例时，在对应示例目录开启调试：

```bash
DEBUG=true npm start
```

OpenAI 路径在生成会话开始前输出 `prompt:`，每轮回复后以完整 JSON 输出 `response from LLM`，其中包含 `finish_reason` 和 `tool_calls`；校验通过后输出 `generated code`。命中代码缓存时会输出 `cached code found`。Jev 路径在请求前输出 `jev request:`，以完整 JSON 展示模型名、`question`、`scope`、拼接后的完整源码 `context` 和判断问题 `questions`。源码中用 `<nl-judge>...</nl-judge>` 包裹问题或条件文本，去掉外层 `nl` 标签和模板反引号，例如 `<nl-judge>1 > 0</nl-judge>`；`state.question` 中也保留同一份文本。`questions.result.instructions` 直接以问题原文开头，再说明源码标记的位置，并以 `scope` 为当前运行时变量值。`question` 是本项目自定义的状态字段名，TypeSafe 实际读取的问题位于 `instructions`。返回后输出 `jev judgment:`，包含实际模型版本、原始概率、阈值 `threshold`、比较方式 `comparison` 和布尔结果。

Babel 示例的 `npm start` 通过 [dotenv](https://github.com/motdotla/dotenv) 自动加载本示例目录下的 `.env`；`nljs` 则自动加载启动目录下的 `.env`。`.env` 和 `.env.*` 已被 Git 忽略，`.env.example` 保留在版本控制中。

也可以从仓库根目录运行，npm 会在对应示例目录加载配置；`--` 后面的参数会原样传给示例：

```bash
npm start --prefix examples/babel/computer -- "计算 123 加 456"
```

终端已导出的同名环境变量优先于 `.env`，因此可以用 `DEBUG=true npm start` 临时开启日志。切换 provider 时也要留意终端里的 `NLJS_PROVIDER`。直接运行编译产物时，使用 `node -r dotenv/config lib/index.js` 加载配置。

### 设置代码生成轮数

OpenAI 代码生成由 Harness 维护多轮对话。默认最多请求模型 **10 轮，包含首轮**；模型漏调用 `final_output` 或提交格式有误时，会收到反馈并在剩余轮次内修正。有效提交立即结束，不再请求总结。

在含 `nl` 的源码文件中，为 Babel 注入的对象赋值即可调整上限：

```js
__NLJS_GLOBAL.maxRounds = 3;

async function sum(a, b) {
  return nl`返回 a + b`;
}

sum(1, 2).then(console.log);
```

赋值须在片段执行前完成，不要重新声明或整体替换 `__NLJS_GLOBAL`。该对象属于当前编译文件，在现有 Node/CommonJS 用法下不会影响其他文件，也不是 `globalThis`。这项配置不通过 `.env` 设置。

`maxRounds` 必须是正的安全整数；字符串、`null`、零、负数和小数等无效值会在请求前报错。未设置或值为 `undefined` 时使用默认值 10。每次 OpenAI 缓存未命中后读取一次配置，并固定当前会话的模型、上下文和轮数上限；修改配置影响下一次新生成。缓存命中和 Jev 路径不读取或校验 `maxRounds`，SDK 自身的 HTTP 重试不计为新一轮。

### 启用 Jev 布尔判断

Jev 运行时需要 Node.js 20 或更新版本（使用 `nljs` 命令仍需 Node.js 24+），以及已获得访问资格的 TypeSafe 账户。先到 [TypeSafe Console](https://console.typesafe.ai/) 确认访问状态，再从 [API Keys](https://console.typesafe.ai/keys) 创建 key。官方 2026-09-15 公告仍将 Jev 描述为 early access，可能需要等待候补名单放行。[官方开通说明](https://typesafe.ai/blog/introducing-system-one-models-and-jev)

从仓库根目录运行新示例：

```bash
npm install --prefix packages/core
npm install --prefix packages/babel
npm install --prefix examples/babel/jevBoolean

export TYPESAFE_API_KEY='your-typesafe-api-key'
export TYPESAFE_DEFAULT_MODEL='jev-1.13.0'
export NLJS_JEV_THRESHOLD='0.8'
NLJS_PROVIDER=jev npm start --prefix examples/babel/jevBoolean
```

示例的判断是 `` const result = nl`1 > 0`; ``，直接打印 Jev 返回概率经阈值转换后的布尔结果，预期输出 `true`。示例源码不包含预期答案断言，也没有提前在本地计算 `1 > 0`。也可以使用示例目录中的 [.env.example](examples/babel/jevBoolean/.env.example) 配置，再运行 `npm start`。

此配置对运行进程内的所有 `nl` 片段生效，适用于只做布尔判断的程序。打印、生成字符串、修改变量或询问用户等片段仍应使用 `openai` 模式。Jev 使用独立 SDK 和 `/v1/systemone` 接口，不需要设置 `OPENAI_API_KEY`。[TypeSafe SDK](https://docs.typesafe.ai/sdk/javascript)

Jev Noul 返回条件成立的概率。设置 `NLJS_JEV_THRESHOLD=0.8` 后，运行时将 `p >= 0.8` 转为 `true`，其余有效概率转为 `false`；恰好 0.8 为 true。阈值接受 `[0, 1]` 内的有限数值，空字符串、非数值或越界配置会在请求前报错。未设置该变量时保留原来的 `p > 0.5` 行为，恰好 0.5 为 false；显式设置为 `0.5` 时使用 `p >= 0.5`。配置仅作用于 Jev，在每次判断时读取，不需要重新编译。判断每次都会请求模型，不使用代码缓存；请求失败或返回无效概率时抛错，不回退到 OpenAI。这个示例用于检查接入链路，实际语义判断的质量仍需用业务样本评估。[Noul 文档](https://docs.typesafe.ai/primitives/noul)

## 示例

单脚本 CLI 示例位于 [examples/cli](examples/cli)，可按快速开始直接运行。下表列出的 Babel 示例位于 `examples/babel/`；运行一个新示例时，进入其目录安装依赖并填写 `.env`。例如，以下命令从仓库根目录运行：

```bash
cd examples/babel/eightQueen
npm install
# 首次使用时复制 .env.example 为 .env，并填写配置
DEBUG=true npm start
```

下表的运行命令都在对应示例目录中执行，并假定已经安装依赖并填写 `.env`；运行时会自动编译。

| 示例 | 内容 | 运行命令 |
| --- | --- | --- |
| [helloWorld](examples/babel/helloWorld) | 用自然语言输出 Hello World | `npm start` |
| [jevBoolean](examples/babel/jevBoolean) | 让 Jev 判断 `1 > 0` 并打印布尔结果 | `npm start` |
| [eightQueen](examples/babel/eightQueen) | 用自然语言描述棋盘操作和判断，递归求解八皇后问题 | `npm start` |
| [jevEightQueen](examples/babel/jevEightQueen) | JavaScript 回溯搜索，让 Jev 判断每次落子是否安全 | `npm start` |
| [asyncSleep](examples/babel/asyncSleep) | 从参数读取秒数，异步等待并逐秒输出 | `npm start -- 3` |
| [computer](examples/babel/computer) | 根据自然语言参数进行数学计算 | `npm start -- "计算 123 加 456"` |
| [multiLangRoshambo](examples/babel/multiLangRoshambo) | 读取石头剪刀布选项，用相同语言输出能获胜的选项 | `npm start -- "石头"` |
| [nlarg](examples/babel/nlarg) | 根据描述生成命令参数，包含交互确认和执行步骤 | `npm start -- ls "list all files including hidden files"` |
| [planner](examples/babel/planner) | 将任务拆成待办，逐项输出并标记完成 | `npm start -- "clean the house"` |
| [react](examples/babel/react) | ReAct 风格的任务循环，通过终端输入提供行动观察 | `npm start -- "帮我规划一次周末旅行"` |
| [metaAgent](examples/babel/metaAgent) | 根据任务生成 Agent 描述、提示词和工具名列表 | `npm start -- "获取网页内容并转换为大写"` |

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
2. **生成或判断**：运行到该位置时，`@nljs/core` 根据 `NLJS_PROVIDER` 选择路径。默认的 OpenAI 路径先检查代码缓存，未命中时由 Harness 维护对话，指定模型调用 `final_output` 工具，通过 `asyncFuncBody` 提交异步函数体；可修正的提交错误会反馈给模型，直到提交有效或达到轮数上限。Jev 路径将片段与当前上下文交给 Noul，按概率返回 `"true"` 或 `"false"` 常量表达式。
3. **执行**：运行时校验工具提交，将函数体包装为异步立即执行函数表达式，并在原调用位置通过 `await eval(...)` 执行。生成代码可以读取或修改调用处可写的变量，也可以通过 `return` 提供片段结果。Jev 的布尔常量表达式沿用同一调用位置执行。

编译本身不调用模型。`nljs` 在加载模块时自动完成转换，无需写出编译文件；Babel 示例会将转换结果写入 `lib/index.js`。模型生成的代码不会写回源码或编译产物。

### 模型输出约定

`final_output(output: { asyncFuncBody: string })` 的参数对象直接包含 `asyncFuncBody`，例如：

```json
{"asyncFuncBody":"return a + b;"}
```

Chat Completions 响应中的 `tool_calls[0].function.arguments` 是这个对象的 JSON 字符串。有效提交要求该轮响应以 `finish_reason: "tool_calls"` 结束，且只有一次 `final_output` 函数工具调用；提交内容只包含函数体，可以使用 `return` 和 `await`，不包含外层函数定义。每轮仍强制指定 `final_output`，并关闭并行工具调用。

Harness 保留每轮 assistant 回复，并根据问题继续或终止：

| 响应情况 | 处理 |
| --- | --- |
| 正常结束但没有工具调用 | 追加 user 提醒，要求调用 `final_output` |
| 完整调用包含无效 JSON、错误字段或未知工具名 | 按调用 ID 回填 tool 错误，要求修正 |
| 同轮多个完整调用，ID 非空且互不重复 | 本轮均不采用，逐个 ID 回填 tool 错误，要求下一轮提交一份 |
| 拒绝、内容过滤、截断或损坏响应 | 立即报错；缺失、空白或重复的调用 ID 等无法合法续写的情况属于损坏响应 |
| 达到轮数上限仍未提交成功 | 报错并保留最后一次提交错误，不再请求模型 |

有效提交立即结束本次生成，无需再请求一轮模型。普通正文和旧的 `<nl>...</nl>` 不用于提取代码。生成阶段失败不写缓存；有效函数体仍按原路径包装、缓存，再在调用处 eval 执行。显式提交空函数体有效，其片段结果为 `undefined`。提交校验不保证 JavaScript 语法或行为正确，执行错误不交回 Harness 修正。

完整协议及模块职责见 [final_output 设计记录](docs/design/final-output-tool.md)和[代码生成 Harness](docs/design/code-generation-harness.md)。

### 编写自己的示例

可以沿用 `helloWorld` 的 `package.json`、`babel.config.js` 和 `.env.example`，在 `examples/babel/` 下新建同级目录。Babel 配置引用本地插件：

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

不需要定义或导入 `nl` 函数，插件会处理这个标签。插件插入 `await`，因此调用位置必须允许使用 `await`。完成后，在新示例目录运行 `npm install`，复制 `.env.example` 为 `.env` 并填写配置，然后执行 `npm start`。

## 代码缓存

**OpenAI 代码缓存默认开启**。首次生成代码后，同一个自然语言片段再次执行时会复用生成的代码。Jev 路径始终绕过此缓存，根据当次状态重新请求判断。

| 项目 | 当前行为 |
| --- | --- |
| 缓存内容 | 生成的 JavaScript 代码；每次命中后仍然执行这段代码 |
| 缓存位置 | 当前 Node.js 进程内的 `Map` |
| 缓存键 | 完整源码 + 片段起始位置 + 片段结束位置 |
| 作用域变量变化 | 不影响缓存键 |
| 生命周期 | 进程退出后清空，不会跨次运行保存到磁盘 |
| 启用方式 | 默认开启，无需设置环境变量 |

因此，相同文本出现在不同源码位置时会分别缓存。需要每轮根据新状态重新生成代码时，可以关闭缓存。使用 Babel 集成且已安装 `@nljs/core` 的项目可以直接调用运行时 API：

```js
const { disableCodeCache } = require('@nljs/core');
disableCodeCache();
```

使用 `nljs` 时，在含 `nl` 的源码文件中通过注入的运行时对象关闭缓存，无需另外安装或导入 `@nljs/core`。`metaAgent` 和 `react` 示例也使用这种方式；调用应放在片段执行之前：

```js
__NLJS_CORE.disableCodeCache();
```

要让它们使用缓存，删除源码中的这行调用，重新编译并启动程序。目前没有运行中重新启用缓存的 API，也没有 `CACHE=true` 这样的配置开关。

使用 `DEBUG=true` 可以通过 `cached code found` 日志确认是否命中缓存。

## 常见问题

### `nl is not defined` 或 `__NLJS_CORE is not defined`

通常是用 `node` 直接执行了含 `nl` 的源码。单脚本使用 CLI 运行：

```bash
nljs hello.js
```

已有 Babel 示例则进入其目录，先编译，再运行产物：

```bash
npm start
```

如果日志中的源码和当前 `index.js` 不一致，也需要重新编译，更新旧的 `lib/index.js`。

### `代码生成失败: 达到代码生成轮数上限 ...`

开启 `DEBUG=true`，检查每轮响应中的 `choices[0].finish_reason` 和 `choices[0].message.tool_calls`，以及错误中保留的最后一次失败原因。正常文字回复会收到工具调用提醒，错误参数会收到修正反馈；如果始终没有有效提交，就会耗尽轮数。缺少 `choices`、响应被截断、拒绝或内容被过滤时会立即失败。

确认 Base URL 包含正确的 API 基础路径，并确认模型与服务支持指定 `final_output` 工具调用。若服务返回不支持 `tools`、`tool_choice` 或 `parallel_tool_calls` 的错误，需要改用支持这些能力的模型或服务；运行时不会降级为文本生成。

### `final_output` 参数错误

`function.arguments` 必须是 JSON 字符串，解析后是只含 `asyncFuncBody` 字符串字段的对象。字符串中的 JSON 无效、字段缺失、值为 `null` 或其他非字符串类型、额外字段，以及嵌套成 `output.asyncFuncBody` 都会反馈给模型修正；若 `arguments` 本身不是字符串，则属于损坏响应并立即失败。达到轮数上限仍未修正时，错误会保留最后一次失败原因及 `cause`，不会写入代码缓存。

### 找不到 `@nljs/core`、`openai` 或 `@babel/template`

使用 Babel 集成时，需要分别安装本地包和所运行示例的依赖。以下命令从仓库根目录运行，以 `helloWorld` 为例：

```bash
npm install --prefix packages/core
npm install --prefix packages/babel
npm install --prefix examples/babel/helloWorld
```

`nljs` 的 tarball 自带插件和运行时，用户脚本无需导入 `@nljs/core`；若使用 CLI 时缺少它自身的依赖，请按快速开始重新打包并安装。

### 修改了配置，但运行时没有变化

使用 CLI 时确认 `.env` 位于启动命令的当前目录；Babel 示例则放在示例目录，用 `npm start` 自动加载。确认已填写 Key、Base URL 和模型名。终端已导出的同名变量优先于 `.env`，修改文件后若仍使用旧配置，检查终端变量并按需 `unset`。

### 输出为空、返回 `undefined` 或生成代码执行失败

开启 `DEBUG=true`，查看 `response from LLM` 中提交的 `asyncFuncBody` 和 `generated code`。函数体为空或没有执行 `return` 时，片段结果可以是 `undefined`；缺少有效工具提交则会明确报错。工具参数校验通过后，生成代码的语法和执行错误仍在调用处暴露，可先用 `helloWorld` 验证接口链路。

## 项目结构与开发

```text
packages/
  cli/                 nljs 命令、加载时转换与独立 tarball 分发
  babel/               Babel 插件与 Jest 测试
    helpers/           作用域变量收集、注入检查
  core/                生成会话 Harness、上下文组装、Jev 判断与缓存
examples/
  cli/                 无需 package.json 或 Babel 配置的单脚本示例
  babel/               各自独立安装、编译和运行的命令行示例
```

从仓库根目录运行测试：

```bash
npm test --prefix packages/core
npm test --prefix packages/babel -- --runInBand
npm test --prefix packages/cli
```

测试覆盖插件转换、作用域变量收集、`final_output` 请求与多轮修正、轮数配置及会话隔离、异步函数体执行、失败不缓存、provider 切换、Jev 概率转换和缓存隔离。运行时测试使用模拟 HTTP 响应，不需要真实 API Key，也不调用外部模型接口；这些测试不证明真实模型的生成质量。

CLI 集成测试从 `nljs` 命令验证 CommonJS/ESM、本地模块、参数和路径、`.env`、错误定位、退出状态、终端信号，以及离开仓库后的 tarball 安装。模型调用使用本地 HTTP 模拟服务。

当前实现的边界：

- 生成的代码通过 `eval` 在当前 Node.js 进程中执行，没有沙箱隔离。
- 模型请求会携带源码上下文和收集到的作用域变量值；调试日志也会输出这些内容。
- 作用域变量使用 `JSON.stringify` 序列化，循环引用、BigInt 等无法直接序列化的值需要由调用方处理。
- 模型输出直接影响程序行为；目前没有生成代码的静态校验，也没有持久化缓存。
