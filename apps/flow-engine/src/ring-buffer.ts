/**
 * Circular Byte Ring Buffer (Fixed Capacity)
 *
 * Prevents V8 Out-Of-Memory (OOM) heap crashes when workflow steps
 * emit large log outputs (e.g. docker build, test suites, npm install).
 * Ensures memory overhead per running step is strictly capped (default: 64 KB).
 */
export class CircularRingBuffer {
  private buffer: Buffer;
  private capacity: number;
  private writePointer: number = 0;
  private isFull: boolean = false;

  constructor(capacityBytes: number = 64 * 1024) {
    this.capacity = capacityBytes;
    this.buffer = Buffer.alloc(this.capacity);
  }

  /**
   * Append a chunk of data (Buffer or string) to the circular ring buffer.
   */
  public write(chunk: Buffer | string): void {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf-8");
    const len = data.length;

    if (len >= this.capacity) {
      data.copy(this.buffer, 0, len - this.capacity, len);
      this.writePointer = 0;
      this.isFull = true;
      return;
    }

    const availableToEnd = this.capacity - this.writePointer;
    if (len <= availableToEnd) {
      data.copy(this.buffer, this.writePointer, 0, len);
      this.writePointer += len;
      if (this.writePointer === this.capacity) {
        this.writePointer = 0;
        this.isFull = true;
      }
    } else {
      data.copy(this.buffer, this.writePointer, 0, availableToEnd);
      const remainder = len - availableToEnd;
      data.copy(this.buffer, 0, availableToEnd, len);
      this.writePointer = remainder;
      this.isFull = true;
    }
  }

  /**
   * Retrieve the current buffer contents in chronological order as a string.
   */
  public toString(): string {
    if (!this.isFull) {
      return this.buffer.toString("utf-8", 0, this.writePointer);
    }

    const part1 = this.buffer.subarray(this.writePointer, this.capacity);
    const part2 = this.buffer.subarray(0, this.writePointer);
    return Buffer.concat([part1, part2]).toString("utf-8");
  }

  /**
   * Get current byte count stored in buffer.
   */
  public get length(): number {
    return this.isFull ? this.capacity : this.writePointer;
  }
}
