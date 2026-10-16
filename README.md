# NL.js

NL.js 是一种将代码与自然语言融合的编程实验。在 `nl` 模板标签中描述意图，模型会结合程序上下文生成 JavaScript，并在片段所在位置执行。自然语言片段可以使用当前变量、返回结果或执行操作。

通过 `npx @nljs/cli` 直接运行 `.js`、`.cjs`、`.mjs`，无需配置 Babel 或手动编译。

[npm](https://www.npmjs.com/package/@nljs/cli) · [使用指南](docs/guide.md) · [示例](docs/guide.md#示例)

## 快速开始

需要 **Node.js 22.x ≥22.18.0 或 24+**，以及兼容 OpenAI  Chat Completions 的大模型 API。

### 1. 编写脚本

新建 `hello.js`，填好模型配置：

```js
globalThis.__NLJS_GLOBAL = {
  apiKey: 'your-api-key',
  baseURL: 'https://your-api-provider.example/v1',
  model: 'your-model-name',
};

async function main() {
  nl`print 'Hello, World'`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```
### 2. 运行

在脚本所在目录执行：

```bash
npx @nljs/cli hello.js
```

输出：

```text
Hello, World
```

CLI 内置插件和运行时，无需克隆仓库或单独安装其他 NL.js 包。经常使用时，也可以[全局安装](docs/guide.md#可选全局安装-nljs-命令)，之后直接运行 `nljs hello.js`。

## 代码缓存

**代码缓存默认开启。** 同一进程中，同一个自然语言片段再次执行时，会复用已生成的 JavaScript，减少模型请求。缓存保存的是代码，每次仍会执行它；变量值变化不会自动触发重新生成。

当前缓存只存于进程内存，退出后清空，不会跨次运行保存到磁盘。

如果需要每次都根据最新上下文重新生成，在含 `nl` 的脚本中、首次片段执行前加入：

```js
__NLJS_CORE.disableCodeCache();
```

`__NLJS_CORE` 由 CLI 自动注入，无需另行导入。Jev 判断模式每次请求模型，不使用代码缓存。更多行为见[缓存说明](docs/guide.md#代码缓存)。

## 试试更多示例

运行仓库自带的 Hello World：将 [配置模板](examples/cli/config.example.cjs) 复制为 `examples/cli/config.cjs` 并填好配置，在仓库根目录执行：

```bash
npx @nljs/cli examples/cli/hello.js "NL.js"
```

还可以探索[八皇后求解](examples/babel/eightQueen)、[自然语言计算器](examples/babel/computer)和 [Jev 布尔判断](examples/babel/jevBoolean)。这些示例的安装和运行方式见[示例指南](docs/guide.md#示例)。

## 文档

- [使用指南](docs/guide.md)：配置选项、模块用法、Jev、故障排查与开发说明。
- [Babel 集成](packages/babel/README.md)：通过 `@nljs/babel` 和 `@nljs/core` 接入已有项目。
- [反馈与讨论](https://github.com/XLCYun/nl.js/issues)：报告问题或提出想法。

## 许可证

[MIT](LICENSE)
