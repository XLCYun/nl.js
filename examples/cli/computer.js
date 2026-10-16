require('./config.cjs');

// This is a program for performing mathematical calculations based on natural language.
async function main() {
  const args = nl`get arguments from the command line`;
  const result = nl`calculate the result of the arguments`;
  nl`print the result`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
