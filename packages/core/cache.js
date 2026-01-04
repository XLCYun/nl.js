
class Cache {
    constructor() {
        this.cache = new Map();
        this._disabled = false;
    }

    disable() {
        this._disabled = true;
    }

    get({code, start, end}) {
        if (this._disabled) {
            return null;
        }
        const key = `${start}-${end}-${code}`;
        return this.cache.get(key);
    }

    set({code, start, end, value}) {
        if (this._disabled) {
            return;
        }
        const key = `${start}-${end}-${code}`;
        this.cache.set(key, value);
    }
}

module.exports = {
    Cache
};
