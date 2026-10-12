# Jev 八皇后

在 8×8 棋盘上逐行尝试放置皇后。JavaScript 负责创建棋盘、落子、撤子和递归回溯，`solve(chessboard, row)` 中的 `nl` 直接提问：`Is it safe to place queen at chessboard[row][column]`。Jev 根据当前棋盘、候选行列和源码上下文判断是否可落子。

棋盘使用 `0` 表示空位、`1` 表示皇后，行列坐标从 `0` 开始。每次请求都会带上当前的 `chessboard`、`row`、`column`，以及用 `<nl-judge>...</nl-judge>` 标记当前问题的完整源码。问题原文保留在 `state.question`，同时直接放进 `questions.result.instructions`，后接运行时变量和源码上下文的说明。示例适配器将 `NLJS_JEV_THRESHOLD=0.8` 映射为共享配置的数值 `jevThreshold: 0.8`，按 `p >= 0.8` 将 Jev 的概率转为 true，决定是否落子。程序找到第一组 Jev 判定可行的布局后停止，用 `Q` 和 `.` 打印棋盘。

## 安装与运行

需要 Node.js 20+ 和 [TypeSafe API Key](https://console.typesafe.ai/keys)。从仓库根目录安装依赖：

```bash
npm install --prefix packages/core
npm install --prefix packages/babel
npm install --prefix examples/babel/jevEightQueen
```

通过示例自己的 `../configure.cjs` 将环境变量映射为 `globalThis.__NLJS_GLOBAL` 后运行：

```bash
export TYPESAFE_API_KEY='your-typesafe-api-key'
export TYPESAFE_DEFAULT_MODEL='jev-1.13.0'
export NLJS_JEV_THRESHOLD='0.8'
NLJS_PROVIDER=jev npm start --prefix examples/babel/jevEightQueen
```

也可以进入示例目录，将 `.env.example` 复制为 `.env`（已有文件时直接编辑），填写 key 后运行：

```bash
cd examples/babel/jevEightQueen
cp .env.example .env
# 编辑 .env，填写 TYPESAFE_API_KEY
npm start
```

`npm start` 会先编译，再运行 `node -r dotenv/config -r ../configure.cjs lib/index.js`：dotenv 显式加载本目录的 `.env`，适配器设置共享配置；终端已导出的同名变量优先。运行时本身不读取 `process.env` 或 `.env`。程序在发起判断前检查共享对象的 `provider` 必须为 `jev`。`.env` 已被 Git 忽略，提交时只保留 `.env.example`。

也可以由自己的独立配置文件直接设置 `globalThis.__NLJS_GLOBAL`，参见根目录 [配置与调试](../../../README.md#配置与调试)。文件级 `__NLJS_MODULE` 保存源码上下文，不保存 provider 或 key。

## 查看每次判断

在示例目录运行：

```bash
DEBUG=true npm start
```

示例适配器将 `DEBUG=true` 转为布尔字段 `debug: true`。`jev request:` 打印完整请求，包括条件文本、当前棋盘和坐标、完整源码上下文以及判断问题；`jev judgment:` 打印模型版本、概率、阈值、比较方式和布尔结果。

共享配置的 `jevThreshold` 接受 `[0, 1]` 内的有限数值，等于配置阈值时返回 true。例如阈值为 `0.8` 时，`0.51` 和 `0.7999` 返回 false，`0.8` 返回 true。未配置时保留 `p > 0.5`，显式配置为 `0.5` 时使用 `p >= 0.5`。修改配置不需要重新编译，每次判断会固定本次阈值。提高阈值会拒绝更多落子，也可能跳过实际可行的位置。

每次尝试一个候选位置都会请求 Jev，包括回溯后的再次尝试，因此一次搜索可能产生数百次请求，耗时和请求数量取决于模型返回的判断。输出是模型判断引导搜索得到的候选解，示例没有校验最终布局是否满足全部冲突规则。搜索耗尽、配置缺失或请求失败时以非零状态退出；“未找到布局”只表示这次模型判断引导的搜索没有得到结果。
