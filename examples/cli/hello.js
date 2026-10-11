async function main() {
  const name = process.argv[2] || 'World';
  const greeting = nl`返回字符串 "Hello, " + name + "!"`;
  console.log(greeting);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
