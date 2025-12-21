/**
 * Min Heap (Priority Queue) Implementation
 * Used for efficient Dijkstra's algorithm
 */

class MinHeap {
    constructor() {
        this.heap = [];
        this.nodePositions = new Map(); // Track node positions for O(1) lookup
    }

    /**
     * Insert node with priority
     */
    insert(node, priority) {
        // If node exists, update priority if new one is lower
        if (this.nodePositions.has(node)) {
            const idx = this.nodePositions.get(node);
            if (priority < this.heap[idx].priority) {
                this.heap[idx].priority = priority;
                this.bubbleUp(idx);
                this.bubbleDown(idx);
            }
            return;
        }

        // Add new node
        this.heap.push({ node, priority });
        this.nodePositions.set(node, this.heap.length - 1);
        this.bubbleUp(this.heap.length - 1);
    }

    /**
     * Extract minimum priority node
     */
    extractMin() {
        if (this.heap.length === 0) return null;
        
        if (this.heap.length === 1) {
            const min = this.heap.pop();
            this.nodePositions.delete(min.node);
            return min.node;
        }

        const min = this.heap[0];
        const last = this.heap.pop();
        
        this.heap[0] = last;
        this.nodePositions.delete(min.node);
        this.nodePositions.set(last.node, 0);
        
        this.bubbleDown(0);

        return min.node;
    }

    /**
     * Bubble up element at index
     */
    bubbleUp(idx) {
        while (idx > 0) {
            const parentIdx = Math.floor((idx - 1) / 2);
            
            if (this.heap[idx].priority >= this.heap[parentIdx].priority) {
                break;
            }

            this.swap(idx, parentIdx);
            idx = parentIdx;
        }
    }

    /**
     * Bubble down element at index
     */
    bubbleDown(idx) {
        while (true) {
            const leftChild = 2 * idx + 1;
            const rightChild = 2 * idx + 2;
            let smallest = idx;

            if (leftChild < this.heap.length && 
                this.heap[leftChild].priority < this.heap[smallest].priority) {
                smallest = leftChild;
            }

            if (rightChild < this.heap.length && 
                this.heap[rightChild].priority < this.heap[smallest].priority) {
                smallest = rightChild;
            }

            if (smallest === idx) break;

            this.swap(idx, smallest);
            idx = smallest;
        }
    }

    /**
     * Swap two elements
     */
    swap(i, j) {
        const temp = this.heap[i];
        this.heap[i] = this.heap[j];
        this.heap[j] = temp;

        this.nodePositions.set(this.heap[i].node, i);
        this.nodePositions.set(this.heap[j].node, j);
    }

    /**
     * Check if heap is empty
     */
    isEmpty() {
        return this.heap.length === 0;
    }

    /**
     * Get heap size
     */
    size() {
        return this.heap.length;
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MinHeap;
}
