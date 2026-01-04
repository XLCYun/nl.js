

const DEBUG = process.env.DEBUG === 'true';

function debug(...args) {
    if (DEBUG) {
        console.debug(...args);
    }
}

module.exports = {
    debug
};