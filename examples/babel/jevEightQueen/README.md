# Jev 八皇后

在 8×8 棋盘上逐行尝试放置皇后。JavaScript 负责创建棋盘、落子、撤子和递归回溯，`isSafe(chessboard, row, column)` 中的 `nl` 直接提问：`Is it legal to place a queen at chessboard[row][column]?` 问题中说明候选位置必须为空，且放置后的皇后与已有皇后没有同行、同列或对角线冲突。

棋盘使用 `0` 表示空位、`1` 表示皇后，行列坐标从 `0` 开始。每次请求都会带上当前的 `chessboard`、`row`、`column`，以及用 `<nl-judge>...</nl-judge>` 标记当前问题的完整源码。问题原文保留在 `state.question`，同时直接放进 `questions.result.instructions`，后接运行时变量和源码上下文的说明。运行时按 `p > 0.5` 将 Jev 的概率转为布尔值，决定是否落子。程序找到第一组 Jev 判定可行的布局后停止，用 `Q` 和 `.` 打印棋盘。

## 安装与运行

需要 Node.js 20+ 和 [TypeSafe API Key](https://console.typesafe.ai/keys)。从仓库根目录安装依赖并编译：

```bash
npm install --prefix packages/core
npm install --prefix packages/babel
npm install --prefix examples/babel/jevEightQueen
npm run build --prefix examples/babel/jevEightQueen
```

通过环境变量开启 Jev 后运行：

```bash
export TYPESAFE_API_KEY='your-typesafe-api-key'
export TYPESAFE_DEFAULT_MODEL='jev-1.13.0'
NLJS_PROVIDER=jev node examples/babel/jevEightQueen/lib/index.js
```

也可以进入示例目录，将 `.env.example` 复制为 `.env`，填写 key 后运行：

```bash
cd examples/babel/jevEightQueen
cp .env.example .env
# 编辑 .env，填写 TYPESAFE_API_KEY
node --env-file=.env lib/index.js
```

## 查看每次判断

在示例目录运行：

```bash
DEBUG=true node --env-file=.env lib/index.js
```

`jev request:` 打印完整请求，包括条件文本、当前棋盘和坐标、完整源码上下文以及判断问题；`jev judgment:` 打印模型版本、概率和布尔结果。

每次尝试一个候选位置都会请求 Jev，包括回溯后的再次尝试，因此一次搜索可能产生数百次请求，耗时和请求数量取决于模型返回的判断。输出是模型判断引导搜索得到的候选解，示例没有校验最终布局是否满足全部冲突规则。搜索耗尽、配置缺失或请求失败时以非零状态退出；“未找到布局”只表示这次模型判断引导的搜索没有得到结果。
