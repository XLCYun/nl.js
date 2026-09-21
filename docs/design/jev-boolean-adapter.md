# Jev 布尔判断接入设计

核对日期：2026-09-21。根据用户选择，已实现通过配置启用 Jev，并新增直接判断 `1 > 0` 的 example。本版使用 `NLJS_PROVIDER=jev`，沿用 `nl` 标签和 `generate` 接口；没有新增 `judge` 或 `nl.boolean` 公共 API。真实推理尚未验证，当前环境未设置 `TYPESAFE_API_KEY`。

## 当前使用方式

```bash
export TYPESAFE_API_KEY='your-typesafe-api-key'
export TYPESAFE_DEFAULT_MODEL='jev-1.13.0'
NLJS_PROVIDER=jev node examples/babel/jevBoolean/lib/index.js
```

首次运行需要安装依赖并编译，完整步骤见 [新示例说明](../../examples/babel/jevBoolean/README.md)。示例源码如下：

```js
const result = nl`1 > 0`;
```

配置对当前进程的所有 `nl` 生效。未设置 provider 时，默认使用原有 OpenAI 兼容代码生成路径。此 example 验证请求、概率转换与返回类型，不代表对复杂判断的质量评测。

## 当前实现与接入边界

当前运行时使用 OpenAI SDK 的兼容接口；实际服务由 `OPENAI_BASE_URL` 和 `OPENAI_MODEL` 决定，不必是 OpenAI 托管的模型。

| 已确认的事实 | 依据 |
| --- | --- |
| `generate({ global, scope, source })` 继续返回可执行的 JavaScript 字符串，Jev 路径只返回 `"true"` 或 `"false"` | [core/index.js](../../packages/core/index.js) |
| 每个 `nl` 片段都会转换成 `await eval(await generate(...))` | [babel/index.js](../../packages/babel/index.js)，第 12–14 行 |
| Babel 目前只识别 `nl`，没有布尔 tag 或返回类型标记 | [babel/index.js](../../packages/babel/index.js)，第 25、58 行 |
| 原有代码生成提示词要求使用 `<nl>` 标签；Jev 单独构造 Noul 问题 | [context.js](../../packages/core/context.js)、[jev.js](../../packages/core/jev.js) |
| 缓存按完整源码与片段位置保存代码，不包含运行时状态 | [cache.js](../../packages/core/cache.js)，第 12–25 行 |
| `nl` 既用于语义判断，也用于字符串生成、修改状态和交互 | [react](../../examples/babel/react/index.js)、[nlarg](../../examples/babel/nlarg/index.js)、[eightQueen](../../examples/babel/eightQueen/index.js) |

特别需要区分两种返回布尔值的片段：

- `react` 中根据 `task`、`observation`、`memory` 判断任务是否完成，属于可能适合 Jev 的纯判断，但同一示例还包含其他能力，本版没有将它整体切换到 Jev。
- `nlarg` 中“询问用户是否执行，然后返回确认结果”包含真人交互。即使结果是 boolean，也不能直接用模型判断替代。

Jev 接收状态与结构化问题，不生成任意 JavaScript。它使用独立的 `POST https://api.typesafe.ai/v1/systemone`，不能只把当前 `OPENAI_MODEL` 改为 Jev。[HTTP API](https://docs.typesafe.ai/api)

## 考虑过的方案

| 方案 | 对外形式 | 适用性与代价 |
| --- | --- | --- |
| A：独立判断函数 | `await judge({ state, instructions, provider: 'jev' })` 返回 boolean | 只需先扩展 core，最快验证模型质量；调用者显式提供状态，暂不改 Babel |
| B：显式布尔片段，未采用 | `` nl.boolean`根据 observation 和 memory 判断任务是否完成` ``，底层调用 A | 同一文件可以混用代码生成与纯判断；需要新增语法与 Babel 转换 |
| C：在 generate 中切换 Jev，本版采用 | 运行时环境变量 `NLJS_PROVIDER=jev` | 沿用现有语法，通过配置选择整进程的能力；适用于该进程所有片段都是纯判断的程序。返回受控的 `"true"` / `"false"` 字符串，并绕开代码缓存 |

用户希望通过配置启用，并添加最小判断示例，因此本版采用 C。A/B 可在以后需要混合能力时重新讨论；当前没有根据提示词关键词或 JavaScript 布尔上下文自动路由。

JavaScript 的 `eval` 会原样返回非字符串参数，所以让 `generate` 有时返回 boolean 技术上可以运行；但这会改变其公开返回契约，也不会自动解决缓存与能力区分问题。

## 运行时约定

以下是第一版实际实现的边界。

1. **通过运行时配置选择能力。** `NLJS_PROVIDER` 接受 `openai`、`jev`，默认 `openai`；非法值明确报错。选择 Jev 时才创建 TypeSafe 客户端，不要求 OpenAI key。环境变量与模型名在运行时读取，切换 provider 不需要重新编译。
2. **保留连贯源码并直接提问。** 从原始 `nl` 片段中去掉外层标签和模板反引号，将问题或条件原文保存在 `state.question` 中。`state.scope` 包含变量当前值，`state.context` 是 `before + '<nl-judge>' + question + '</nl-judge>' + after` 拼接成的完整源码字符串。`<nl-judge>...</nl-judge>` 是项目自定义的定位标记，标签内的文本与 `question` 有意重复。Noul 的 `instructions` 直接以问题原文开头，再说明源码标记的位置，并以 scope 为当前变量值。`question` 是自定义的 state 字段名，实际提问的 API 字段是 `questions.result.instructions`；Noul 支持问句和陈述式条件。不会将 before、after 拆成两个字段交给 Jev。[State](https://docs.typesafe.ai/concepts/state)、[Noul](https://docs.typesafe.ai/primitives/noul)
3. **保留已有上下文语义。** Babel 不变，提取条件文本时保留内部换行、转义字符和插值源码；只移除外层模板语法，不解码转义，也不新增 JavaScript 插值求值行为。模板插值仍与 scope 一起交给模型。示例使用直接的 `1 > 0` 文本，不先在本地计算答案。
4. **概率由代码转成布尔值。** Noul 返回 `P(yes)`，不存在独立的 confidence。本版固定使用 `p > 0.5`，恰好 0.5 为 false。`DEBUG=true` 在请求前以完整 JSON 打印模型名、state 和 questions，返回后显示原始概率及布尔结果；接近 0.5 仍表示模型不确定，固定阈值不代表质量保证。[Noul](https://docs.typesafe.ai/primitives/noul)
5. **每次重新判断。** Jev 分支在代码缓存检查之前执行，既不读也不写代码缓存，避免冻结首次结果；也不会命中此前 OpenAI 保存的代码。OpenAI 仍使用原有代码缓存。
6. **错误与否定分开。** 缺少 key、请求失败或非法概率抛出 `Jev 判断失败`，保留原始错误为 cause。使用 SDK 默认重试策略，没有回退到 OpenAI，也不吞错返回 false。
7. **独立问题才可批量。** 同一状态上的多个独立问题可以合并请求；后一个判断依赖前一个结果或中间动作时仍需顺序执行。[State](https://docs.typesafe.ai/concepts/state)

修改范围：core 新增 Jev 适配器与 provider 分支，添加 SDK 依赖、运行时测试和 `jevBoolean` 示例，README 记录配置。Babel 沿用现有转换。

例如，当前示例发送的 context 包含以下连续代码，标签内是条件文本，question 同时保留 `1 > 0`：

```text
async function main() {
  const result = <nl-judge>1 > 0</nl-judge>;
  console.log(result);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
```

示例只打印结果，已移除 `assert.strictEqual(result, true)` 及 assert 导入。测试里的预期结果仍由测试代码校验，不嵌入示例源码。

## 如何获得 Jev 访问并配置 SDK

1. 进入 [TypeSafe Console](https://console.typesafe.ai/) 登录或注册，确认账户访问状态。官方 2026-09-15 公告仍描述为 early access，并逐步放行 waitlist，不能保证新账号立即获准。[发布公告](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
2. 获准后到 [API Keys](https://console.typesafe.ai/keys) 创建 TypeSafe key。也可以先在 [Playground](https://console.typesafe.ai/playground) 试验 Noul 问题。[Quick start](https://docs.typesafe.ai/introduction/quickstart)
3. 配置 TypeSafe 并显式选择 provider：

```bash
export NLJS_PROVIDER='jev'
export TYPESAFE_API_KEY='your-typesafe-api-key'
export TYPESAFE_DEFAULT_MODEL='jev-1.13.0'
# 可省略；SDK 默认地址就是此地址，末尾不加 /v1
export TYPESAFE_BASE_URL='https://api.typesafe.ai'
```

SDK 使用 `TYPESAFE_DEFAULT_MODEL`，默认值为 `jev-latest`。当前文档中 `jev-latest` 指向 `jev-1.13.0`；生产评估后建议固定版本。[客户端配置](https://docs.typesafe.ai/sdk/javascript/api/interfaces/TypeSafeClientConfig)、[模型列表](https://docs.typesafe.ai/models)

可以先验证认证与模型列表：

```bash
curl --fail-with-body https://api.typesafe.ai/v1/models \
  -H "Authorization: Bearer $TYPESAFE_API_KEY"
```

该接口成功不等于推理余额充足。当前列表主要返回别名，固定版本即使不在列表中也可被请求接受。公开接入文档没有额外的逐模型启用步骤；账户访问资格和余额仍需在控制台确认。[模型列表](https://docs.typesafe.ai/models)

官方 JavaScript SDK 支持 CommonJS，要求 Node.js 20 或更新版本。本项目已将其加入 core 的依赖，从仓库根目录安装：

```bash
npm install --prefix packages/core
```

依赖采用 `@typesafe-ai/sdk ^0.6.0`，锁文件记录本次安装版本。[JavaScript SDK](https://docs.typesafe.ai/sdk/javascript)

## SDK 最小布尔判断示例

下面是按当前 SDK 契约编写的独立示例，需在能解析 `@typesafe-ai/sdk` 的包目录中运行。它不是已经存在的 NL.js API；本次未调用推理验证结果。

```js
const { TypeSafeClient, noul } = require('@typesafe-ai/sdk');

async function main() {
  const client = new TypeSafeClient();
  const response = await client.systemOne({
    state: { left: 1, right: 0 },
    questions: {
      result: noul('Is `left` greater than `right`?'),
    },
  });

  const answer = response.answers?.result;
  const p = answer?.noul;
  if (answer?.type !== 'noul' || !Number.isFinite(p) || p < 0 || p > 1) {
    throw new Error('Invalid Jev Noul response');
  }

  // 与当前 NL.js 适配器相同的阈值约定。
  const value = p > 0.5;
  console.log({ value, probability: p, model: response.model });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
```

接口与 helper 已对照 [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript)、[noul()](https://docs.typesafe.ai/sdk/javascript/api/functions/noul) 及官方 SDK v0.6.0 源码核对。

## 成本、效果和验证

截至核对日期，官方模型页列出的价格为每百万输入 tokens 0.042 美元，输出免费；没有确认账户固定免费赠额。官方说明英语表现最好，中文可以输入但质量不等同于英语。项目应使用自己的中英文判断样本评估，不能直接套用宣传的速度或准确率。[模型列表](https://docs.typesafe.ai/models)

现有代码生成会缓存可重用的程序，后续命中可能无需模型请求；纯判断通常每次状态变化都要调用模型。因此“Jev 单次请求较低成本”不能直接推出整个循环更省或更快，需按相同任务比较首次、后续和整体耗时。

验证重点：

- 同一片段前后状态不同，得到的判断不能复用第一次常量。
- 正确处理概率 0、1、阈值附近、恰好等于阈值，以及缺失或非法返回值。
- 服务错误不会变成业务 false；Jev 路径不要求 OpenAI key。
- provider 切换后不串用缓存，默认 OpenAI 路径继续生成并执行代码。
- 新 example 能经由原有 Babel 转换得到严格的布尔结果。
- 用带预期标签的真实样本比较判断质量、延迟和请求次数；网络测试需要获准的账户，mock 测试不能证明模型准确率。

core 测试覆盖连续源码中的目标定位、相同条件在不同位置出现、概率边界、状态变化、provider 切换、缺少 key、401 与非法响应。示例使用模拟 HTTP 验证编译产物，真实模型质量或延迟尚未评测。

## 本版决策范围

| 决策 | 结果 |
| --- | --- |
| 用户选择的入口方向 | 增加配置项启用；实现为运行时 `NLJS_PROVIDER=jev` |
| 用户指定的示例 | 新增 `jevBoolean`，直接将 `1 > 0` 交给 Jev |
| 返回契约 | generate 返回字符串表达式，原调用点执行后得到 boolean |
| 首版判断策略 | `p > 0.5`，每次请求，错误上抛，无跨模型回退 |
| 验证界限 | 本地测试和编译可验证；真实推理需配置有访问资格的 TypeSafe key |

这些选择集中于本次小范围接入，暂不单独创建 ADR；术语记录在 [CONTEXT.md](../../CONTEXT.md)。
