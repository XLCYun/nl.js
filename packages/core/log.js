

const DEBUG = process.env.DEBUG === 'true';

function debug(...args) {
    if (DEBUG) {
        console.debug(...args);
    }
}

function debugJson(label, value) {
    if (DEBUG) {
        console.debug(label, JSON.stringify(value, null, 2));
    }
}

module.exports = {
    debug,
    debugJson
};
