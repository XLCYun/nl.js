// These environment names belong to the examples, not to the NL.js runtime.
// The npm start commands load dotenv before this explicit configuration step.
const provider = process.env.NLJS_PROVIDER ?? 'openai';
const useJev = provider === 'jev';
const configuration = {
  provider,
  apiKey: useJev ? process.env.TYPESAFE_API_KEY : process.env.OPENAI_API_KEY,
  baseURL: useJev ? process.env.TYPESAFE_BASE_URL : process.env.OPENAI_BASE_URL,
  model: useJev ? process.env.TYPESAFE_DEFAULT_MODEL : process.env.OPENAI_MODEL,
  debug: process.env.DEBUG === 'true',
};

if (useJev && process.env.NLJS_JEV_THRESHOLD !== undefined) {
  const value = process.env.NLJS_JEV_THRESHOLD.trim();
  // Number('') would silently turn an invalid empty threshold into zero.
  configuration.jevThreshold = value === '' ? NaN : Number(value);
}

globalThis.__NLJS_GLOBAL = configuration;
