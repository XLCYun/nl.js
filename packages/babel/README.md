# @nljs/babel

将 JavaScript 中的 `nl` 自然语言片段转换为 NL.js 运行时调用的 Babel 插件。只想直接运行脚本时，可使用 [@nljs/cli](https://www.npmjs.com/package/@nljs/cli)。

## 安装

```bash
npm install @nljs/core
npm install --save-dev @nljs/babel @babel/core@7 @babel/cli@7
```

在 `babel.config.json` 中引用插件的完整包名：

```json
{
  "plugins": ["module:@nljs/babel"]
}
```

`module:` 前缀让 Babel 直接解析 `@nljs/babel`，避免按插件命名规则改写包名。插件默认生成 CommonJS 的 `require('@nljs/core')` 调用。

保存 `hello.cjs`：

```js
async function main() {
  const name = 'NL.js';
  const greeting = nl`返回字符串 "Hello, " + name + "!"`;
  console.log(greeting);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

在独立的 `config.cjs` 中填写配置：

```js
globalThis.__NLJS_GLOBAL = {
  apiKey: 'your-api-key',
  baseURL: 'https://your-api-provider.example/v1',
  model: 'your-model-name',
};
```

编译并运行：

```bash
npx babel hello.cjs --out-file compiled.cjs
node --require ./config.cjs compiled.cjs
```

配置必须在第一个片段执行前就绪。运行时不主动加载 `.env`，也不读取环境变量中的模型配置。

## ESM

如果保留 ESM 输出，启用 `runtimeImport`，以原生 `import` 加载运行时：

```json
{
  "plugins": [["module:@nljs/babel", { "runtimeImport": true }]]
}
```

自然语言片段会插入 `await`，应放在 `async` 函数内；ESM 还支持模块顶层片段。配置中的 `validateAsyncContext: true` 可在编译阶段检查这一限制。模型请求发生在运行阶段。

完整配置、Jev 布尔判断及示例见 [NL.js 文档](https://github.com/XLCYun/nl.js#readme)。

## 许可证

MIT
