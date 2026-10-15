function createLogger(enabled) {
  return {
    debug(...args) {
      if (enabled) console.debug(...args);
    },
    debugJson(label, value) {
      if (enabled) console.debug(label, JSON.stringify(value, null, 2));
    },
  };
}

module.exports = { createLogger };
