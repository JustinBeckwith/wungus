export class FixedQueue {
	private queue: string[];
	private size: number;
	constructor(size: number) {
		this.queue = [];
		this.size = size;
	}
	push(item: string) {
		if (this.queue.length >= this.size) {
			this.queue.shift();
		}
		this.queue.push(item);
	}
	toArray() {
		return this.queue;
	}
}
