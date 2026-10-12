# Jev 布尔判断

这个示例通过 `nl` 标签将 `1 > 0` 交给 Jev 判断，直接打印布尔结果。示例源码不包含预期答案断言。

需要 Node.js 20+ 和已获得访问资格的 [TypeSafe API Key](https://console.typesafe.ai/keys)。从仓库根目录安装依赖：

```bash
npm install --prefix packages/core
npm install --prefix packages/babel
npm install --prefix examples/babel/jevBoolean
```

这个 Babel 示例用 `../configure.cjs` 把调用方选择的环境变量映射到 `globalThis.__NLJS_GLOBAL`。通过该适配器开启 Jev：

```bash
export TYPESAFE_API_KEY='your-typesafe-api-key'
export TYPESAFE_DEFAULT_MODEL='jev-1.13.0'
export NLJS_JEV_THRESHOLD='0.8'
NLJS_PROVIDER=jev npm start --prefix examples/babel/jevBoolean
```

也可以进入此目录，将 `.env.example` 复制为 `.env`（已有文件时直接编辑），填写 key 后运行：

```bash
cd examples/babel/jevBoolean
cp .env.example .env
# 编辑 .env，填写 TYPESAFE_API_KEY
npm start
```

`npm start` 会先编译，再运行 `node -r dotenv/config -r ../configure.cjs lib/index.js`：dotenv 显式加载本目录的 `.env`，适配器设置共享对象的 `provider`、`apiKey`、`model`、`jevThreshold` 等字段。终端已导出的同名变量优先。运行时本身不读取 `process.env` 或 `.env`；这些变量名属于示例。`.env` 已被 Git 忽略，提交时只保留 `.env.example`。

预期标准输出为：

```text
true
```

示例适配器将 `DEBUG=true` 转为共享对象的布尔字段 `debug: true`。开启后在请求前通过 `jev request:` 打印完整 JSON 请求体，包括模型名、条件文本、作用域变量、拼接后的完整源码和判断问题。当前判断位置写成 `<nl-judge>1 > 0</nl-judge>`，`state.question` 也为 `1 > 0`；两处都去掉外层 `nl` 标签和模板反引号。`questions.result.instructions` 直接以 `1 > 0` 开头，再补充源码标记和运行时变量的说明。`question` 是自定义字段，既可保留问句，也可保留这个示例中的陈述式条件。返回后通过 `jev judgment:` 显示模型版本、原始概率、阈值、比较方式和布尔结果。

示例将 `NLJS_JEV_THRESHOLD=0.8` 转为数值 `jevThreshold: 0.8`，按 `p >= 0.8` 返回 true；对象字段只接受 `[0, 1]` 内的有限数值，未设置时保留 `p > 0.5`。判断没有先在本地求值 `1 > 0`，也没有复用代码缓存。判断为 false 时直接输出 `false`；非法阈值、缺少 key 或请求失败时，程序以非零状态退出。

共享对象的 `provider` 对后续 `nl` 调用生效；这个例子需要 `provider: 'jev'`。不用环境变量时，也可以在独立配置文件中直接设置对象，再于执行片段前加载它；参见根目录 [配置与调试](../../../README.md#配置与调试)。每个文件的 `__NLJS_MODULE` 只保存源码上下文，不承担模型配置。
