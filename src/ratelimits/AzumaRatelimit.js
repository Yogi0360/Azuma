const { Util } = require('discord.js');
const { setTimeout: sleep } = require('node:timers/promises');

/**
 * Represents a ratelimit cache data for an endpoint
 * @class AzumaRatelimit
 */
module.exports = class AzumaRatelimit {
    /**
     * @param {AzumaManager} manager The manager for this ratelimit queue
     * @param {string} id The ID of this ratelimit queue
     * @param {string} hash The ratelimit hash for this ratelimit queue
     * @param {string} route The route for this ratelimit queue
     */
    constructor(manager, id, hash, route) {
        /**
         * The manager for this ratelimit queue
         * @type {AzumaManager}
         */
        this.manager = manager;
        /**
         * The ID of this ratelimit queue
         * @type {string}
         */
        this.id = id;
        /**
         * The ratelimit hash for this ratelimit queue
         * @type {string}
         */
        this.hash = hash;
        /**
         * The route for this ratelimit queue
         * @type {string}
         */
        this.route = route;
        /**
         * The max number of request you can do in this ratelimit queue cycle
         * @type {number}
         */
        this.limit = -1;
        /**
         * The remaining requests you can do in this ratelimit queue cycle
         * @type {number}
         */
        this.remaining = -1;
        /**
         * When this ratelimit queue remaining requests will reset
         * @type {number}
         */
        this.reset = -1;
        /**
         * Retry-After header for this requests, 0 if nothing out of ordinary happened
         * @type {number}
         */
        this.after = -1;
    }
    /**
     * Generates an update object for this class to parse
     * @static
     * @param {*} request
     * @param {*} headers
     * @returns {Object}
     */
    static constructData(request, headers) {
        if (!request || !headers) throw new Error('Request and Headers can\'t be null');
        return {
            date: headers.get('date'),
            limit: headers.get('x-ratelimit-limit'),
            remaining: headers.get('x-ratelimit-remaining'),
            reset: headers.get('x-ratelimit-reset'),
            hash: headers.get('X-RateLimit-Bucket'),
            after: headers.get('retry-after'),
            global: !!headers.get('x-ratelimit-global'),
            reactions: request.route.includes('reactions')
        };
    }
    /**
     * Gets the offset = require(api and this system
     * @static
     * @param {string} date
     * @returns {number}
     */
    static getAPIOffset(date) {
        return new Date(date).getTime() - Date.now();
    }
    /**
     * Calculates the reset for ratelimit
     * @static
     * @param {string} reset
     * @param {string} date
     * @returns {number}
     */
    static calculateReset(reset, date) {
        return new Date(Number(reset) * 1000).getTime() - AzumaRatelimit.getAPIOffset(date);
    }
    /**
     * If this ratelimit cache is considered as ratelimit hit to stop requests = require(occuring
     * @type {boolean}
     * @readonly
     */
    get limited() {
        return !!this.manager.timeout || this.remaining <= 0 && Date.now() < this.reset;
    }
    /**
     * Timeout before the ratelimit clears, takes account the offset as well
     * @type {number}
     * @readonly
     */
    get timeout() {
        return this.reset + this.manager.azuma.options.requestOffset - Date.now();
    }
    /**
     * Updates the data in this cached ratelimit info
     * @param {string} method
     * @param {string} route
     * @param {Object} data
     * @returns {void}
     */
    update(method, route, { date, limit, remaining, reset, hash, after, global, reactions } = {}) {
        // Set or Update this queue ratelimit data
        this.limit = !isNaN(limit) ? Number(limit) : Infinity;
        this.remaining = !isNaN(remaining) ? Number(remaining) : -1;
        this.reset = !isNaN(reset) ? AzumaRatelimit.calculateReset(reset, date) : Date.now();
        this.after = !isNaN(after) ? Number(after) * 1000 : -1;
        // Handle buckets via the hash header retroactively
        if (hash && hash !== this.hash) {
            this.manager.azuma.emit('debug',
                'Received a bucket hash update\n' +
                `  Route        : ${route}\n` +
                `  Old Hash     : ${this.hash}\n` +
                `  New Hash     : ${hash}`
            );
            this.manager.hashes.set(`${method}:${route}`, hash);
        }
        // https://github.com/discordapp/discord-api-docs/issues/182
        if (reactions)
            this.reset = new Date(date).getTime() - AzumaRatelimit.getAPIOffset(date) + this.manager.azuma.sweepInterval;
        // Global ratelimit, will halt all the requests if this is true
        if (global) {
            this.manager.azuma.emit('debug', `Globally Ratelimited, all request will stop for ${this.after}`);
            this.manager.timeout = Date.now() + this.after;
            sleep(this.after).then(() => this.manager.timeout = 0);
        }
    }
}