const assert = require('assert');
__NLJS_CORE.disableCodeCache();

/**
 * This is a function to perform an action and return the observation of the action
 * @param {string} action - the action to be performed
 * @returns {Promise<string>} return the observation of the action
 */
async function act(action) {
  // we don't really need to do the action
  // let pretend user's input is the observation of the action
  const observation = nl`ask for input and return string input as the observation of the action`
  assert(typeof observation === 'string', 'Observation should be a string');
  return observation;
}

async function main() {
  let task = nl`get the task from the command line argument`;
  nl`print I will start to do the task: ${task}`;

  let done = false
  let observation = ""
  const memory = [] // memory of the task and observation
  while (true) {
    const nextTask = nl`According to the task and observation, what should I do next? return a string`;
    observation = await act(nextTask);
    memory.push({ task: nextTask, observation: observation });

    done = nl`According to the observation and memory, is the task done?`;
    if (done) break;
  }

  const needAnswer = nl`return true if user need a answer`;
  if(!needAnswer) {
    nl`print the task is done!`;
    return;
  }

  const answer = nl`return the string as answer based on the memory`;
  nl`print the answer: ${answer}`;
}

main();