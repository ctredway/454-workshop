/**
 * Character-counting streaming, GRBL's recommended protocol and the one 454 Control uses: keep
 * sending while the lines awaiting `ok` fit in the controller's 128-byte receive buffer (127 used,
 * one byte of margin), and count each `ok` or `error` against the oldest line sent.
 */
export class Streamer {
  pending: number[] = [];         // lengths of lines sent and not yet answered
  queue: string[];
  sent = 0; answered = 0; errors: { line: string; reply: string }[] = [];
  private sentLines: string[] = [];
  constructor(lines: string[], private write: (s: string) => void, private capacity = 127) { this.queue = lines.slice(); }
  get inFlight() { return this.pending.reduce((a, b) => a + b, 0); }
  fill() {
    while (this.queue.length) {
      const line = this.queue[0], len = line.length + 1;
      if (this.inFlight + len > this.capacity) return;
      this.queue.shift(); this.pending.push(len); this.sentLines.push(line); this.write(line + '\n'); this.sent++;
    }
  }
  /** Feed one line the controller sent back; returns true when it answered a line. */
  onLine(reply: string): boolean {
    if (reply === 'ok' || reply.startsWith('error:')) {
      this.pending.shift(); const line = this.sentLines.shift()!; this.answered++;
      if (reply !== 'ok') this.errors.push({ line, reply });
      return true;
    }
    return false;
  }
  get done() { return !this.queue.length && !this.pending.length; }
}
