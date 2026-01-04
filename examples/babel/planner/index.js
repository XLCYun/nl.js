const assert = require('assert');

// This is a program to simulate a planner.
async function main() {
  // example: node ./index.js "clean the house"
  // the task should be "clean the house"
  const task = nl`get the task from the command line argument`;
  const todos = nl`plan by the task, and give me a list of todos( type should be {todo: string, done: boolean}[] )`;
  nl`print the todos`;

  while(true) {
    const allDone = nl`return true if all todos are done`;
    if(allDone) break

    const nextTodo = nl`return the next todo from the todos`;
    // we don't really need to do the todo, just print it
    nl`print what to do next`;
    nl`set nextTodo to done`;
  }

  console.log('todos:', todos);
  assert(Object.values(todos).every(todo => todo.done), 'All todos should be done');
  nl`print the task is done`;
}

main();
