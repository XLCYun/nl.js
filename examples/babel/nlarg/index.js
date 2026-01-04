
async function main() {
  const command = nl`get the first argument from the command line`;
  const argsDescription = nl`get all left arguments from the command line`;
  const args = nl`base on the command and argsDescription, what args should be passed to the command`;

  nl`print the command and args`;
  return 0;
}

main();