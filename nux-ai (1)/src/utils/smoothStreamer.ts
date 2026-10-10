/**
 * Smooth Typewriter Streamer
 * Provides realistic character/token pacing so AI generation appears smoothly typed
 * with the cursor moving organically, even when backend chunks arrive in large blocks.
 */

export interface SmoothStreamerOptions {
  onEmit: (chunk: string, fullText: string) => void;
  signal?: AbortSignal;
}

export class SmoothStreamer {
  private targetText = '';
  private currentText = '';
  private isEnded = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private onEmit: (chunk: string, fullText: string) => void;
  private signal?: AbortSignal;
  private resolveCompletion: (() => void) | null = null;
  private completionPromise: Promise<void>;

  constructor(options: SmoothStreamerOptions) {
    this.onEmit = options.onEmit;
    this.signal = options.signal;
    this.completionPromise = new Promise((resolve) => {
      this.resolveCompletion = resolve;
    });

    if (this.signal) {
      if (this.signal.aborted) {
        this.flush();
      } else {
        this.signal.addEventListener('abort', () => this.flush(), { once: true });
      }
    }
  }

  /**
   * Updates target text (e.g. cumulative text from streaming)
   */
  push(newFullText: string) {
    this.targetText = newFullText;
    this.ensureLoop();
  }

  /**
   * Appends incremental chunk
   */
  append(chunk: string) {
    this.targetText += chunk;
    this.ensureLoop();
  }

  /**
   * Signals that network transmission has ended.
   * Waits for the typewriter to finish writing out any remaining buffer.
   */
  async end(finalText?: string): Promise<string> {
    if (finalText !== undefined && finalText.length >= this.targetText.length) {
      this.targetText = finalText;
    }
    this.isEnded = true;
    this.ensureLoop();
    await this.completionPromise;
    return this.currentText;
  }

  /**
   * Instantly outputs all remaining text without delay (e.g. on abort or skip)
   */
  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.currentText !== this.targetText) {
      this.currentText = this.targetText;
      this.onEmit(this.currentText, this.currentText);
    }
    if (this.resolveCompletion) {
      this.resolveCompletion();
    }
  }

  private ensureLoop() {
    if (this.timer) return;
    this.tick();
  }

  private tick = () => {
    this.timer = null;

    if (this.signal?.aborted) {
      if (this.resolveCompletion) this.resolveCompletion();
      return;
    }

    const remaining = this.targetText.length - this.currentText.length;

    if (remaining <= 0) {
      if (this.isEnded) {
        if (this.resolveCompletion) this.resolveCompletion();
        return;
      }
      return;
    }

    // Organic typewriter speed calculation:
    // When text is short or arriving steadily: 1 char per 15-20ms (smooth natural typing)
    // When queue builds up (> 50 chars): 2-4 chars per 12ms
    // When large buffer arrives (> 150 chars): smoothly catches up at 8-15 chars per 10ms
    let step = 10;
    let delay = 8;

    if (this.isEnded) {
      // Once network response is completed, flush remainder immediately so user has zero lag
      step = remaining;
      delay = 0;
    } else if (remaining > 150) {
      step = Math.min(remaining, Math.ceil(remaining / 2));
      delay = 4;
    } else if (remaining > 60) {
      step = 25;
      delay = 6;
    } else if (remaining > 20) {
      step = 15;
      delay = 8;
    } else {
      step = 8;
      delay = 10;
    }

    const nextLength = Math.min(this.targetText.length, this.currentText.length + step);
    const prevLength = this.currentText.length;
    this.currentText = this.targetText.slice(0, nextLength);
    const addedChunk = this.targetText.slice(prevLength, nextLength);

    this.onEmit(addedChunk, this.currentText);

    if (delay === 0) {
      if (this.resolveCompletion) this.resolveCompletion();
    } else {
      this.timer = setTimeout(this.tick, delay);
    }
  };
}
