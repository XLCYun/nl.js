
async function main() {
  // example:
  // node ./index.js ls list all file including hidden files
  // the command should be "ls"
  // the argsDescription should be "list all file including hidden files"
  const command = nl`get the first argument from the command line`;
  const argsDescription = nl`get all left arguments from the command line`;
  const args = nl`base on the command and argsDescription, what args should be passed to the command, give me a string`;

  nl`print the command and args`;
  return 0;
}

main();