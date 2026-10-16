// src/modules/proposal/editHistory.ts
// Undo/redo stack for BOQ edits. Kept pure and generic so the past/present/
// future transitions are unit-testable without React. BOQTable applies it to
// the `overrides` map — the only BOQ state the user edits directly; every
// quantity and rate is otherwise derived by calcBOQ().

export interface EditHistory<T> {
  past: T[];
  present: T;
  future: T[];
}

/** Cap on retained undo steps — a long data-entry session shouldn't grow unbounded. */
export const HISTORY_LIMIT = 60;

export function emptyHistory<T>(present: T): EditHistory<T> {
  return { past: [], present, future: [] };
}

export function pushHistory<T>(h: EditHistory<T>, next: T): EditHistory<T> {
  return {
    past: [...h.past, h.present].slice(-HISTORY_LIMIT),
    present: next,
    // A fresh edit abandons the redo branch — redoing into a state the user
    // has already navigated away from would be surprising.
    future: [],
  };
}

export function undoHistory<T>(h: EditHistory<T>): EditHistory<T> {
  if (h.past.length === 0) return h;
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future],
  };
}

export function redoHistory<T>(h: EditHistory<T>): EditHistory<T> {
  if (h.future.length === 0) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, h.present], present: next, future: rest };
}
