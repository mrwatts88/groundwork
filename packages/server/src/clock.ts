// The world clock (DESIGN.md 11.1). Present at 1x up to the max speed while
// someone is interacting, away at the away rate after the idle time. The clock
// only decides rates. The server schedules ticks from it.

import type { ClockMode, ClockStatus } from "@groundwork/protocol";

export interface ClockOptions {
  readonly tickMs: number;
  readonly maxSpeed: number;
  readonly awayAfterMs: number;
  readonly awayRate: number;
}

export class Clock {
  private readonly options: ClockOptions;
  private lastInputAt: number;
  private speed = 1;

  constructor(options: ClockOptions, now: number) {
    this.options = options;
    // A fresh server has seen no one, so it starts away.
    this.lastInputAt = now - options.awayAfterMs;
  }

  /** Any client input. Returns true if the clock mode or rate changed. */
  input(now: number): boolean {
    const before = this.status(now);
    this.lastInputAt = now;
    const after = this.status(now);
    return before.rate !== after.rate || before.mode !== after.mode;
  }

  /** Set the speed-up, clamped to 1..maxSpeed. Counts as input. Returns true if the rate changed. */
  setSpeed(speed: number, now: number): boolean {
    const before = this.status(now).rate;
    this.speed = Math.min(this.options.maxSpeed, Math.max(1, Math.floor(speed)));
    this.lastInputAt = now;
    return this.status(now).rate !== before;
  }

  mode(now: number): ClockMode {
    if (now - this.lastInputAt >= this.options.awayAfterMs) return "away";
    return this.speed > 1 ? "speedup" : "present";
  }

  status(now: number): ClockStatus {
    const mode = this.mode(now);
    return { mode, rate: mode === "away" ? this.options.awayRate : this.speed, speed: this.speed };
  }

  /** Real milliseconds until the next tick at the current rate. */
  interval(now: number): number {
    return this.options.tickMs / this.status(now).rate;
  }

  /** Real milliseconds until away mode starts, or 0 if already away. */
  untilAway(now: number): number {
    return Math.max(0, this.lastInputAt + this.options.awayAfterMs - now);
  }
}
