async function main() {
  const result = nl`1 > 0`;
  console.log(result);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
