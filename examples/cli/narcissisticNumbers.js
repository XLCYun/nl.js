require('./config.cjs');

async function main() {
  for (let n = 100; n < 1000; n++)
    if (nl`判断 n 是否等于它各位数字的立方和，返回布尔值`)
      console.log(n);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
