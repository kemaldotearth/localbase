/**
 * Simple Observable implementation for live queries
 */

import type { ObservableCallback, Unsubscribe } from "../types";

export class Observable<T> {
  private callbacks: Set<ObservableCallback<T>> = new Set();
  private _value: T | undefined;

  constructor(initialValue?: T) {
    this._value = initialValue;
  }

  get value(): T | undefined {
    return this._value;
  }

  subscribe(callback: ObservableCallback<T>): Unsubscribe {
    this.callbacks.add(callback);

    // Immediately call with current value if it exists
    if (this._value !== undefined) {
      callback(this._value);
    }

    return () => {
      this.callbacks.delete(callback);
    };
  }

  next(value: T): void {
    this._value = value;
    this.callbacks.forEach((callback) => {
      try {
        callback(value);
      } catch (error) {
        console.error("Error in observable callback:", error);
      }
    });
  }

  unsubscribeAll(): void {
    this.callbacks.clear();
  }

  get subscriberCount(): number {
    return this.callbacks.size;
  }
}
