const assert = require('assert');

__NLJS_CORE.disableCodeCache();

/**
 * This is a tool function to get the content from the url
 * @name httpGet
 * @param {string} url - the url to get the content from
 * @returns {Promise<string>} return url
 */
async function httpGet(url) {
  return url // we don't really need to do the action, just return the url
}

/**
 * This is a tool function to process the content
 * @name processContent
 * @param {string} content - the content to be processed
 * @returns {Promise<string>} return the processed content
 */
async function processContent(content) {
  return nl`return the capitalized content`;
}

class Agent {
  memory = [];
  prompt = null;
  tools = null;
  name = ""

  constructor(name, prompt, tools) {
    this.name = name;
    this.prompt = prompt;
    this.tools = tools;
  }
}

async function main() {
  const task = nl`get the task from the command line argument`;

  const agentDescriptions = nl`Base on the task, 
  how many agents we need to generate to complete the task,
  give me a string array in which each element is a description of an agent`;
  assert(Array.isArray(agentDescriptions), 'agentDescriptions should be an array');

  const agents = [];
  for(const agentDescription of agentDescriptions) {
    const name = nl`Base on the agentDescription, return the name of the agent`;
    const prompt = nl`Base on the task and agentDescription, elaborate a prompt for the agent`;
    const tools = nl`Base on the agentDescription, return the tools that the agent can use, give me a string array in which each element is the name of a tool`;
    const agent = new Agent(name, prompt, tools);
    agents.push(agent);
  }
  console.log(agents);
}

main();