/**
 * Real token distance for Supporter range warnings (U4). Provide Aid and Lighten the Load name a 60 ft range, Concussive
 * Maintenance a 5 ft Reach and Control a 100 ft command range. A range warning is only useful if it is measured, so the
 * sheet passes this distance to the plan instead of a hardcoded 0.
 *
 * Returns `undefined` (never 0) when either token is not on the viewed scene, so a missing token never looks like "in range"
 * and never raises a false warning. The result feeds a warning the user can override; nothing is ever blocked.
 */
const list = collection => Array.from(collection?.values?.() ?? collection ?? []);

const centerOf = (token, grid) => {
  const document = token.document ?? token;
  if (typeof token.getCenterPoint === "function") return token.getCenterPoint();
  const size = Number(grid?.size) || 100;
  return { x: Number(document.x ?? 0) + (Number(document.width ?? 1) * size) / 2, y: Number(document.y ?? 0) + (Number(document.height ?? 1) * size) / 2 };
};

/** One point per occupied grid space (or the centre on a gridless scene), so a Large token is measured from its nearest space. */
function pointsOf(token, grid) {
  const document = token.document ?? token;
  const offsets = grid && !grid.isGridless ? document.getOccupiedGridSpaceOffsets?.() ?? [] : [];
  const points = offsets.length && typeof grid.getCenterPoint === "function" ? offsets.map(offset => grid.getCenterPoint(offset)) : [];
  return points.length ? points : [centerOf(token, grid)];
}

function pathFeet(grid, from, to) {
  const measured = grid?.measurePath?.([from, to])?.distance;
  if (Number.isFinite(Number(measured))) return Number(measured);
  const unit = Number(grid?.distance) || 5, size = Number(grid?.size) || 100;
  return Math.hypot(to.x - from.x, to.y - from.y) * unit / size;
}

/**
 * Distance in feet between the tokens of two Actors (by uuid) on the viewed scene. `tokens` and `grid` are injectable for
 * tests; they default to the live canvas.
 */
export function tokenDistanceFeet(uuidA, uuidB, { tokens = globalThis.canvas?.tokens?.placeables, grid = globalThis.canvas?.grid } = {}) {
  if (!uuidA || !uuidB || uuidA === uuidB) return undefined;
  const placed = list(tokens);
  const a = placed.find(token => token.actor?.uuid === uuidA);
  const b = placed.find(token => token.actor?.uuid === uuidB);
  if (!a || !b) return undefined;
  let best = Infinity;
  for (const from of pointsOf(a, grid)) for (const to of pointsOf(b, grid)) best = Math.min(best, pathFeet(grid, from, to));
  return Number.isFinite(best) ? Math.round(best * 100) / 100 : undefined;
}
