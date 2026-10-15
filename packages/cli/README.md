# @nljs/cli

直接运行包含 `nl` 自然语言片段的 JavaScript 脚本，无需配置 Babel 或手动编译。CLI 内置 NL.js 插件和运行时，不需要另装 `@nljs/core` 或 `@nljs/babel`。

需要 Node.js 22.x ≥22.18.0，或 Node.js 24 及更新主版本；不支持 Node.js 23.x。

## 使用

在独立的 `config.cjs` 中配置模型服务：

```js
globalThis.__NLJS_GLOBAL = {
  apiKey: 'your-api-key',
  baseURL: 'https://your-api-provider.example/v1',
  model: 'your-model-name',
};
```

保存 `hello.js`：

```js
require('./config.cjs');

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

直接运行：

```bash
npx --yes @nljs/cli hello.js "NL.js"
```

也可以全局安装后使用 `nljs` 命令：

```bash
npm install --global @nljs/cli
nljs hello.js "NL.js"
nljs --help
```

默认使用 OpenAI 兼容的 Chat Completions 接口，服务需要支持工具调用。`apiKey`、`baseURL`、`model` 必须显式提供；运行时不读取 `process.env` 中的模型配置，也不会主动加载 `.env`。配置文件需要由脚本自己导入，请勿把真实 API Key 提交到版本库。

支持 `.js`、`.cjs`、`.mjs` 及本地模块导入。CommonJS 中的自然语言片段需放在 `async` 函数内；ESM 还支持顶层片段。第三方依赖仍安装在脚本所属项目中，`node_modules` 默认不转换。当前 CLI 不支持 TypeScript 或 JSX。

更多配置、Jev 布尔判断及示例见 [NL.js 文档](https://github.com/XLCYun/nl.js#readme)。

## 许可证

MIT
