# @nljs/core

NL.js 的运行时，为 Babel 转换后的自然语言片段提供代码生成与 Jev 布尔判断能力。只想直接运行脚本时，可使用内置运行时的 [@nljs/cli](https://www.npmjs.com/package/@nljs/cli)。

## 安装

```bash
npm install @nljs/core
npm install --save-dev @nljs/babel @babel/core@7 @babel/cli@7
```

使用方式见 [@nljs/babel](https://www.npmjs.com/package/@nljs/babel)。插件负责转换 `nl` 模板标签，生成的程序会加载 `@nljs/core`，因此 core 应作为项目的运行时依赖安装。

## 配置

在不含自然语言片段的独立配置文件中赋值，并在执行片段前加载：

```js
globalThis.__NLJS_GLOBAL = {
  provider: 'openai',
  apiKey: 'your-api-key',
  baseURL: 'https://your-api-provider.example/v1',
  model: 'your-model-name',
  maxRounds: 10,
};
```

`apiKey`、`baseURL`、`model` 都是必填项。运行时不主动加载 `.env`，也不从 `process.env` 获取模型配置。默认的 OpenAI 路径需要支持工具调用的 Chat Completions 服务；设置 `provider: 'jev'` 可使用 TypeSafe Jev 做布尔判断。

运行时返回代码字符串，由插件在片段的作用域内执行。通常无需直接调用 `generate`。完整配置约定、执行行为及示例见 [NL.js 使用指南](https://github.com/XLCYun/nl.js/blob/main/docs/guide.md)。

## 许可证

MIT
