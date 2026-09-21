# Jev 布尔判断

这个示例通过 `nl` 标签将 `1 > 0` 交给 Jev 判断，直接打印布尔结果。示例源码不包含预期答案断言。

需要 Node.js 20+ 和已获得访问资格的 [TypeSafe API Key](https://console.typesafe.ai/keys)。从仓库根目录安装依赖并编译：

```bash
npm install --prefix packages/core
npm install --prefix packages/babel
npm install --prefix examples/babel/jevBoolean
npm run build --prefix examples/babel/jevBoolean
```

通过环境变量开启 Jev：

```bash
export TYPESAFE_API_KEY='your-typesafe-api-key'
export TYPESAFE_DEFAULT_MODEL='jev-1.13.0'
NLJS_PROVIDER=jev node examples/babel/jevBoolean/lib/index.js
```

也可以进入此目录，将 `.env.example` 复制为 `.env`，填写 key 后运行：

```bash
node --env-file=.env lib/index.js
```

预期标准输出为：

```text
true
```

`DEBUG=true` 会在请求前通过 `jev request:` 打印完整 JSON 请求体，包括模型名、条件文本、作用域变量、拼接后的完整源码和判断问题。当前判断位置写成 `<nl-judge>1 > 0</nl-judge>`，`state.question` 也为 `1 > 0`；两处都去掉外层 `nl` 标签和模板反引号。`questions.result.instructions` 直接以 `1 > 0` 开头，再补充源码标记和运行时变量的说明。`question` 是自定义字段，既可保留问句，也可保留这个示例中的陈述式条件。返回后通过 `jev judgment:` 显示模型版本、原始概率和布尔结果。运行时采用 `p > 0.5`，没有先在本地求值 `1 > 0`，也没有复用代码缓存。判断为 false 时直接输出 `false`；缺少 key 或请求失败时，程序以非零状态退出。

`NLJS_PROVIDER` 对当前进程的所有 `nl` 片段生效。不设置时使用 OpenAI 兼容的代码生成路径；这个例子需要显式设置为 `jev`。
