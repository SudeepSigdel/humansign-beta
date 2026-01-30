/**
 * HumanSign Event Chain (Blockchain)
 * Manages blocks of keystroke events with cryptographic linking
 */

import { computeBlockHash } from './crypto.js';

export class EventChain {
    constructor() {
        this.blocks = [];
        this.currentEvents = [];
        this.previousHash = "GENESIS";
        this.eventCount = 0;
    }

    /**
     * Add a keystroke event to the current block
     * @param {number} timestamp - Event timestamp in milliseconds
     * @param {string} eventType - "keydown" or "keyup"
     */
    addEvent(timestamp, eventType) {
        this.currentEvents.push([timestamp, eventType]);
        this.eventCount++;
    }

    /**
     * Get current pending event count (not yet sealed)
     */
    getPendingCount() {
        return this.currentEvents.length;
    }

    /**
     * Get total event count
     */
    getTotalCount() {
        return this.eventCount;
    }

    /**
     * Seal the current block and add to chain
     * Creates cryptographic link to previous block
     */
    async sealBlock() {
        if (this.currentEvents.length === 0) return null;

        const blockHash = await computeBlockHash(
            this.previousHash,
            this.currentEvents
        );

        const block = {
            events: [...this.currentEvents],
            prev_hash: this.previousHash,
            block_hash: blockHash
        };

        this.blocks.push(block);
        this.previousHash = blockHash;
        this.currentEvents = [];

        return block;
    }

    /**
     * Finalize the chain (seal any remaining events)
     * @returns {Promise<Array>} Complete blockchain
     */
    async finalize() {
        await this.sealBlock();
        return this.blocks;
    }

    /**
     * Get the current chain (may have pending unsealed events)
     */
    getChain() {
        return this.blocks;
    }

    /**
     * Reset the chain for a new session
     */
    reset() {
        this.blocks = [];
        this.currentEvents = [];
        this.previousHash = "GENESIS";
        this.eventCount = 0;
    }

    /**
     * Export chain state for persistence
     */
    toJSON() {
        return {
            blocks: this.blocks,
            currentEvents: this.currentEvents,
            previousHash: this.previousHash,
            eventCount: this.eventCount
        };
    }

    /**
     * Restore chain state from persistence
     */
    static fromJSON(data) {
        const chain = new EventChain();
        chain.blocks = data.blocks || [];
        chain.currentEvents = data.currentEvents || [];
        chain.previousHash = data.previousHash || "GENESIS";
        chain.eventCount = data.eventCount || 0;
        return chain;
    }
}
