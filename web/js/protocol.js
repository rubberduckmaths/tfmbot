// protocol.js -- the ids of the engine session's views (web/wasm; the worker passes views through as JSON):
// D, the kind of decision pending (view.pending.kind); AK, the kind of an action (view.legal[i].k, view.last.act.k).
export const D = { NONE: 0, SETUP: 1, TILE: 2, PRELUDE_PLAY: 3, BONUS: 4, DRAFT: 5, RESEARCH: 6, ACTION: 7, FG: 8, OVER: 9, KEEP: 10, PLAY_PRELUDE: 11, TRIGGER: 12, BUY: 13 };
export const AK = { PLAY: 0, SP: 1, MS: 2, AW: 3, BLUE: 4, PLANTS: 5, HEAT: 6, PASS: 7, END: 8 };
