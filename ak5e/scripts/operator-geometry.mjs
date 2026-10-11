/** Pure 2D map geometry. Token occupied-cell centers are supplied by the V13 grid API. */
const epsilon = 1e-7;
export function containsPoint(shape, point) {
  const dx = point.x - shape.x, dy = point.y - shape.y;
  const angle = (shape.direction ?? 0) * Math.PI / 180;
  const x = dx * Math.cos(angle) + dy * Math.sin(angle), y = -dx * Math.sin(angle) + dy * Math.cos(angle);
  const distance = shape.distance;
  if (shape.type === "circle") return dx * dx + dy * dy <= distance * distance + epsilon;
  if (shape.type === "cone") {
    if (shape.coneType === "flat") return x >= -epsilon && x <= distance + epsilon && Math.abs(y) <= x * Math.tan((shape.angle ?? 53.13) * Math.PI / 360) + epsilon;
    return Math.hypot(dx, dy) <= distance + epsilon && Math.abs(Math.atan2(y, x)) <= (shape.angle ?? 53.13) * Math.PI / 360 + epsilon;
  }
  if (shape.type === "rect") return x >= -epsilon && y >= -epsilon && x <= distance + epsilon && y <= distance + epsilon;
  if (shape.type === "ray") return x >= -epsilon && x <= distance + epsilon && Math.abs(y) <= shape.width / 2 + epsilon;
  if (shape.type === "cross") return Math.abs(x) <= distance / 2 + epsilon && Math.abs(y) <= shape.width / 2 + epsilon
    || Math.abs(y) <= distance / 2 + epsilon && Math.abs(x) <= shape.width / 2 + epsilon;
  return false;
}
export function wallBlocks(a, b, wall) {
  if (wall.door && wall.ds === 1 || wall.move === 0 && wall.sight === 0) return false;
  const [x1, y1, x2, y2] = wall.c;
  const rx = b.x - a.x, ry = b.y - a.y, sx = x2 - x1, sy = y2 - y1;
  const cross = rx * sy - ry * sx;
  if (Math.abs(cross) < epsilon) return false;
  const t = ((x1 - a.x) * sy - (y1 - a.y) * sx) / cross;
  const u = ((x1 - a.x) * ry - (y1 - a.y) * rx) / cross;
  if (t <= epsilon || t >= 1 - epsilon || u < -epsilon || u > 1 + epsilon) return false;
  if (wall.dir) {
    const side = sx * (a.y - y1) - sy * (a.x - x1);
    if (wall.dir === 1 && side > 0 || wall.dir === 2 && side < 0) return false;
  }
  return true;
}
export const clearPath = (a, b, walls) => !walls.some(wall => wallBlocks(a, b, wall));

/** Visibility graph around wall endpoints. Paths must remain inside the original area. */
export function reachesPoint(shape, point, walls, corners = false) {
  const origin = { x: shape.x, y: shape.y };
  if (clearPath(origin, point, walls)) return true;
  if (!corners) return false;
  const nodes = [origin, point];
  for (const wall of walls) {
    if (wall.door && wall.ds === 1 || wall.move === 0 && wall.sight === 0) continue;
    for (let index = 0; index < 4; index += 2) for (const [dx, dy] of [[-0.1, -0.1], [-0.1, 0.1], [0.1, -0.1], [0.1, 0.1]]) {
      const node = { x: wall.c[index] + dx, y: wall.c[index + 1] + dy };
      if (containsPoint(shape, node)) nodes.push(node);
    }
  }
  const visited = new Set([0]), queue = [0];
  while (queue.length) {
    const index = queue.shift();
    for (let next = 1; next < nodes.length; next++) {
      if (visited.has(next) || !clearPath(nodes[index], nodes[next], walls)) continue;
      // Convex shapes keep segments inside. Crosses need sampling through the intersection.
      if (shape.type === "cross" && ![0.25, 0.5, 0.75].every(t => containsPoint(shape,
        { x: nodes[index].x + t * (nodes[next].x - nodes[index].x), y: nodes[index].y + t * (nodes[next].y - nodes[index].y) }))) continue;
      if (next === 1) return true;
      visited.add(next); queue.push(next);
    }
  }
  return false;
}
export function affectedTokens(tokens, shapes, { walls = [], corners = false, piercing = false, sourceId, excludeSource = false, testPoint = containsPoint } = {}) {
  return tokens.filter(token => (!excludeSource || token.id !== sourceId)
    && token.points.some(point => shapes.some(shape => testPoint(shape, point) && (piercing || reachesPoint(shape, point, walls, corners)))));
}
export function feetToPixels(scene, feet) {
  const units = String(scene.grid.units ?? "ft").toLowerCase();
  if (!/^(ft|feet|foot|m|meters?|metres?)$/.test(units)) throw new Error("Set scene distance units to feet or meters before resolving a Skill.");
  return feet * (/^(m|meters?|metres?)$/.test(units) ? 0.3048 : 1) * scene.grid.size / scene.grid.distance;
}
