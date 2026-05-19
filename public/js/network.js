// Wraps socket.io client. Stays connected to current host (auto from window.location).
/* global io */

export class Net {
  constructor() {
    this.socket = io({ transports: ['websocket', 'polling'] });
    this._listeners = new Map();
    this.socket.onAny((event, payload) => {
      const set = this._listeners.get(event);
      if (set) for (const cb of set) cb(payload);
    });
  }

  on(event, cb) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(cb);
    return () => this._listeners.get(event)?.delete(cb);
  }

  emit(event, payload) {
    this.socket.emit(event, payload);
  }
}
