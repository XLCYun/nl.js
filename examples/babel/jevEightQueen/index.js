async function solve(chessboard, row) {
  if (row === chessboard.length) {
    return true;
  }

  for (let column = 0; column < chessboard.length; column++) {
    if (nl`Is it safe to place queen at chessboard[row][column]`) {
      chessboard[row][column] = 1;
      if (await solve(chessboard, row + 1)) {
        return true;
      }
      chessboard[row][column] = 0;
    }
  }

  return false;
}

async function main() {
  if (process.env.NLJS_PROVIDER !== 'jev') {
    throw new Error('请设置 NLJS_PROVIDER=jev 后运行此示例');
  }

  const chessboard = Array.from({ length: 8 }, () => Array(8).fill(0));
  console.log('开始搜索八皇后布局，每次尝试落子都由 Jev 判断...');
  const found = await solve(chessboard, 0);

  if (!found) {
    console.log('未找到 Jev 判定可行的布局。');
    process.exitCode = 1;
    return;
  }

  console.log('Jev 判定可行的布局：');
  for (const row of chessboard) {
    console.log(row.map((cell) => cell === 1 ? 'Q' : '.').join(' '));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
