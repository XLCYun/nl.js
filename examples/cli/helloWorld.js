require('./config.cjs');

async function main() {
  nl`print "Hello, World!"`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
