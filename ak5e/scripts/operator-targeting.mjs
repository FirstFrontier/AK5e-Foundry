import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { skillTargetProfile, spellSaveDC, validateSkillPrerequisites, nativePhaseActivities } from "./operator-target-profiles.mjs";
export { nativePhaseActivities } from "./operator-target-profiles.mjs";
import { affectedTokens, feetToPixels, clearPath, containsPoint } from "./operator-geometry.mjs";
import { isConstruct } from "./world-rule-state.mjs";

const list = collection => Array.from(collection?.values?.() ?? collection ?? []);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const metadata = item => item?.flags?.ak5e?.operatorSkill;
export const OPERATOR_TARGET_PROFILES = Object.freeze(Object.fromEntries(CHAPTER_THREE_CLASSES.filter(entry => entry.operatorSkill)
  .map(entry => [entry.id, skillTargetProfile(entry)])));
export function profileForSkill(item) {
  const profile = OPERATOR_TARGET_PROFILES[metadata(item)?.sourceId];
  return profile ? structuredClone(profile) : null;
}
function phaseWeaponRange(actor, phase, itemId) {
  if (!phase.weaponRange) return phase;
  const weapon = actor.items.get(itemId), range = Number(weapon?.system.range?.value);
  if (weapon?.type !== "weapon" || !weapon.system.equipped || !Number.isFinite(range) || range <= 0) throw new Error("Select an equipped source-legal weapon with a Normal Range.");
  const feet = weapon.system.range.units === "m" ? range / 0.3048 : range;
  return { ...phase, ...(phase.shape === "ray" ? { distance: feet } : { range: feet }) };
}
export function registerSkillTargetBinding() {
  game.keybindings?.register("ak5e", "targetSkill", {
    name: "Target an Operator Skill", hint: "Target the hovered token, or selected tokens. Hold Shift to add targets.",
    editable: [{ key: "KeyT", modifiers: ["CONTROL"] }], reservedModifiers: ["SHIFT"],
    precedence: globalThis.CONST?.KEYBINDING_PRECEDENCE?.PRIORITY ?? 0, onDown: context => targetSkillTokens(context)
  });
}
/** Preserve native template behavior for every document outside this module's areas. */
export function registerSkillTemplateGeometry() {
  const Base = CONFIG.MeasuredTemplate?.objectClass;
  if (!Base) return;
  CONFIG.MeasuredTemplate.objectClass = class OperatorMeasuredTemplate extends Base {
    containsOccupiedPoint(point) { this.shape ??= this._computeShape(); return this.testPoint(point); }
    _computeShape() {
      const shape = this.document.flags.ak5e?.operatorArea;
      if (!shape) return super._computeShape();
      const a = shape.direction * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      const polygon = vertices => new PIXI.Polygon(vertices.flatMap(([x, y]) => [x * c - y * s, x * s + y * c]));
      if (shape.type === "circle") return new PIXI.Circle(0, 0, shape.distance);
      if (shape.type === "cone") {
        if (shape.coneType === "flat") return polygon([[0, 0], [shape.distance, -shape.distance * Math.tan(shape.angle * Math.PI / 360)], [shape.distance, shape.distance * Math.tan(shape.angle * Math.PI / 360)]]);
        const vertices = [[0, 0]], half = shape.angle * Math.PI / 360;
        for (let i = 0; i <= 40; i++) vertices.push([Math.cos(-half + i * half / 20) * shape.distance, Math.sin(-half + i * half / 20) * shape.distance]);
        return polygon(vertices);
      }
      if (shape.type === "rect") return polygon([[0, 0], [shape.distance, 0], [shape.distance, shape.distance], [0, shape.distance]]);
      return polygon([[0, -shape.width / 2], [shape.distance, -shape.width / 2], [shape.distance, shape.width / 2], [0, shape.width / 2]]);
    }
  };
}
export function targetSkillTokens(context = {}) {
  if (!globalThis.canvas?.ready) return false;
  if (document.activeElement?.matches?.("input,textarea,select,[contenteditable=true]")) return false;
  const hovered = canvas.tokens.placeables.find(token => token.hover && token.visible && !token.document.hidden && !token.document.flags?.ak5e?.standardProp);
  const tokens = hovered ? [hovered] : canvas.tokens.controlled.filter(token => token.visible && !token.document.hidden && !token.document.flags?.ak5e?.standardProp);
  if (!tokens.length) return false;
  const add = context.isShift ?? context.event?.shiftKey ?? false;
  if (!add) for (const token of list(game.user.targets)) token.setTarget(false, { releaseOthers: false });
  for (const token of tokens) token.setTarget(true, { releaseOthers: false });
  context.event?.preventDefault?.();
  return true;
}
export function tokenCenter(token) {
  if (token.getCenterPoint) return token.getCenterPoint();
  const size = token.parent.grid.size;
  return { x: token.x + token.width * size / 2, y: token.y + token.height * size / 2 };
}
export function tokenPoints(token) {
  const grid = token.parent.grid;
  if (grid.isGridless || grid.type === 0) return [tokenCenter(token)];
  const offsets = token.getOccupiedGridSpaceOffsets?.() ?? [];
  return offsets.length ? offsets.map(offset => grid.getCenterPoint(offset)) : [tokenCenter(token)];
}
function rangeAllows(scene, startPoints, endPoints, feet) {
  const maximum = feetToPixels(scene, feet) * scene.grid.distance / scene.grid.size;
  return startPoints.some(start => endPoints.some(end => {
    const measured = scene.grid.measurePath?.([start, end])?.distance;
    const distance = measured ?? Math.hypot(end.x - start.x, end.y - start.y) * scene.grid.distance / scene.grid.size;
    return distance <= maximum + 1e-7;
  }));
}
async function confirm(content) {
  return foundry.applications.api.DialogV2.confirm({ window: { title: "Operator Skill: review source" }, content, rejectClose: false });
}
async function chooseSource(actor, explicit) {
  if (explicit) return explicit;
  const tokens = list(canvas.scene?.tokens).filter(token => token.actor?.uuid === actor.uuid);
  if (tokens.length === 1) return tokens[0].uuid;
  if (!tokens.length) throw new Error("Place this Actor's token on the active scene before using a targeted Skill.");
  return foundry.applications.api.DialogV2.wait({ window: { title: "Choose the Skill's source token" }, rejectClose: false,
    content: `<select name="source">${tokens.map(token => `<option value="${esc(token.uuid)}">${esc(token.name)} (${token.x}, ${token.y})</option>`).join("")}</select>`,
    buttons: [{ action: "choose", label: "Choose", callback: (_event, button) => button.form.elements.source.value }] });
}

/** Only local PIXI graphics are created during placement. No scene or SP writes. */
export async function previewSkillArea(phase, source) {
  const scene = source.parent, origin = tokenCenter(source), stage = canvas.stage;
  if (canvas.scene?.id !== scene.id || !canvas.ready) throw new Error("View the source token's scene to place its area.");
  const shapes = [], graphics = new PIXI.Graphics();
  stage.addChild(graphics);
  const layer = canvas.activeLayer;
  const savedTargets = list(game.user.targets);
  let position = { ...origin }, direction = 0, finish;
  const completion = new Promise(resolve => { finish = resolve; });
  const pixels = feetToPixels(scene, phase.distance);
  const draw = () => {
    graphics.clear(); graphics.lineStyle(3, 0x70c8ff, 0.9); graphics.beginFill(0x70c8ff, 0.2);
    const current = { type: phase.shape, x: phase.anchor === "source" ? origin.x : position.x,
      y: phase.anchor === "source" ? origin.y : position.y, distance: phase.variable ? Math.min(pixels, Math.max(1, Math.hypot(position.x - origin.x, position.y - origin.y))) : pixels,
      width: feetToPixels(scene, phase.width ?? 5), angle: phase.angle ?? 53.13,
      coneType: phase.angle === 180 ? "round" : "flat", direction };
    for (const shape of [...shapes, current]) {
      const a = shape.direction * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      const polygon = vertices => graphics.drawPolygon(vertices.flatMap(([x, y]) => [shape.x + x * c - y * s, shape.y + x * s + y * c]));
      if (shape.type === "circle") graphics.drawCircle(shape.x, shape.y, shape.distance);
      else if (shape.type === "cone") {
        if (shape.coneType === "flat") { polygon([[0, 0], [shape.distance, -shape.distance * Math.tan(shape.angle * Math.PI / 360)], [shape.distance, shape.distance * Math.tan(shape.angle * Math.PI / 360)]]); continue; }
        const vertices = [[0, 0]], half = shape.angle * Math.PI / 360;
        for (let i = 0; i <= 40; i++) vertices.push([Math.cos(-half + i * half / 20) * shape.distance, Math.sin(-half + i * half / 20) * shape.distance]);
        polygon(vertices);
      } else if (shape.type === "rect") polygon([[0, 0], [shape.distance, 0], [shape.distance, shape.distance], [0, shape.distance]]);
      else if (shape.type === "cross") {
        const d = shape.distance / 2, w = shape.width / 2;
        polygon([[-d, -w], [d, -w], [d, w], [-d, w]]); polygon([[-w, -d], [w, -d], [w, d], [-w, d]]);
      } else polygon([[0, -shape.width / 2], [shape.distance, -shape.width / 2], [shape.distance, shape.width / 2], [0, shape.width / 2]]);
    }
    graphics.endFill();
    const tokens = eligibleAreaTokens(scene, source, phase, [...shapes, current]);
    populateSkillTargets(tokens.filter(token => token.object?.visible));
    return current;
  };
  const move = event => {
    position = event.getLocalPosition(stage);
    if (phase.anchor === "source") direction = Math.atan2(position.y - origin.y, position.x - origin.x) * 180 / Math.PI;
    draw();
  };
  const click = event => {
    event.stopPropagation();
    if (event.button !== 0) { finish(null); return; }
    const shape = draw();
    if (phase.range != null && !rangeAllows(scene, tokenPoints(source), [shape], phase.range)) {
      ui.notifications.warn("Place the area within the Skill's source range."); return;
    }
    shapes.push(shape);
    if (shapes.length >= (phase.templates ?? 1)) finish(shapes); else draw();
  };
  const key = event => { if (event.key === "Escape") { event.preventDefault(); finish(null); } };
  const wheel = event => { event.preventDefault(); direction += Math.sign(event.deltaY) * (event.shiftKey ? 15 : 5); draw(); };
  const cancel = event => { event.preventDefault(); finish(null); };
  const changed = () => finish(null);
  const hook = Hooks.on("canvasTearDown", changed);
  try {
    canvas.templates.activate(); draw();
    stage.on("pointermove", move); stage.on("pointerdown", click);
    window.addEventListener("keydown", key, true); canvas.app.view.addEventListener("wheel", wheel, { passive: false });
    canvas.app.view.addEventListener("contextmenu", cancel);
    ui.notifications.info("Place the Skill area: click to confirm, mouse wheel to rotate, Escape/right-click to cancel.");
    return await completion;
  } finally {
    stage.off("pointermove", move); stage.off("pointerdown", click); Hooks.off("canvasTearDown", hook);
    window.removeEventListener("keydown", key, true); canvas.app.view.removeEventListener("wheel", wheel);
    canvas.app.view.removeEventListener("contextmenu", cancel); graphics.destroy(); layer?.activate();
    populateSkillTargets(savedTargets.map(token => token.document));
  }
}

export function populateSkillTargets(tokens) {
  if (!globalThis.canvas?.ready) return;
  for (const token of list(game.user.targets)) token.setTarget(false, { releaseOthers: false });
  for (const token of tokens) if (token.object?.visible && (game.user.isGM || !token.hidden)) token.object.setTarget(true, { releaseOthers: false });
}
export function eligibleAreaTokens(scene, source, phase, shapes) {
  const tokens = list(scene.tokens).filter(token => token.actor && !token.flags?.ak5e?.standardProp);
  const testers = new Map();
  if (globalThis.CONFIG?.MeasuredTemplate?.objectClass?.prototype.containsOccupiedPoint) for (const shape of shapes) {
    if (shape.type === "cross") continue;
    const document = new CONFIG.MeasuredTemplate.documentClass({ t: shape.type, x: shape.x, y: shape.y, distance: 1,
      flags: { ak5e: { operatorArea: shape } } }, { parent: scene });
    testers.set(shape, new CONFIG.MeasuredTemplate.objectClass(document));
  }
  return affectedTokens(tokens.map(token => ({ id: token.id, token, points: tokenPoints(token) })), shapes,
    { walls: list(scene.walls), corners: phase.corners, piercing: phase.piercing, sourceId: source.id, excludeSource: phase.excludeSource,
      ...(testers.size ? { testPoint: (shape, point) => testers.get(shape)?.containsOccupiedPoint(point) ?? containsPoint(shape, point) } : {}) })
    .map(candidate => candidate.token).filter(token => {
      if (!phase.disposition) return true;
      if (![1, -1].includes(source.disposition) || ![1, -1].includes(token.disposition)) return phase.narrativeTokenUuids?.includes(token.uuid) === true;
      return phase.disposition === "hostile" ? token.disposition !== source.disposition : token.disposition === source.disposition;
    });
}
export async function prepareSkillActivation(actor, item, options = {}) {
  const profile = profileForSkill(item);
  validateSkillPrerequisites(actor, { ...metadata(item), targetProfile: null });
  if (!profile) return { itemId: item.id, ...options };
  if (profile.notes.length && options.confirmation !== true) {
    if (!await confirm(`<p>${esc(profile.sourceEffect)}</p><ul>${profile.notes.map(note => `<li>${esc(note)}</li>`).join("")}</ul><p>Confirm that all prerequisites and target restrictions are satisfied.</p>`)) return null;
  }
  let phase = profile.phases[0];
  if (phase.weaponRange && !options.weaponItemId) {
    const weapons = list(actor.items).filter(item => item.type === "weapon" && item.system.equipped && item.system.range?.value);
    const weaponItemId = await foundry.applications.api.DialogV2.wait({ window: { title: "Choose a source-legal weapon" }, rejectClose: false,
      content: `<select name="weapon">${weapons.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("")}</select>`,
      buttons: [{ action: "choose", label: "Choose", callback: (_event, button) => button.form.elements.weapon.value }] });
    if (!weaponItemId) return null;
    options = { ...options, weaponItemId };
  }
  phase = phaseWeaponRange(actor, phase, options.weaponItemId);
  const targetTokenUuids = phase.mode === "area" && !phase.choice ? [] : options.targetTokenUuids ?? list(game.user.targets).map(token => token.document.uuid);
  const data = { ...options, itemId: item.id, confirmation: true, targetTokenUuids,
    visibleTokenUuids: list(canvas?.tokens?.placeables).filter(token => token.visible && (game.user.isGM || !token.document.hidden)).map(token => token.document.uuid) };
  if (!phase.mode) return data;
  data.sourceTokenUuid = await chooseSource(actor, options.sourceTokenUuid);
  if (!data.sourceTokenUuid) return null;
  const source = await fromUuid(data.sourceTokenUuid);
  if (phase.mode === "area") {
    data.shapes = options.shapes ?? await previewSkillArea(phase, source);
    if (!data.shapes) return null;
    if (phase.choice && !options.targetTokenUuids) {
      const candidates = eligibleAreaTokens(source.parent, source, phase, data.shapes).filter(token => token.object?.visible);
      data.targetTokenUuids = await foundry.applications.api.DialogV2.wait({ window: { title: "Creatures of your choice" }, rejectClose: false,
        content: candidates.map(token => `<label><input type="checkbox" name="victim" value="${esc(token.uuid)}" checked>${esc(token.name)}</label>`).join(""),
        buttons: [{ action: "choose", label: "Choose", callback: (_event, button) => [...button.form.querySelectorAll('input:checked')].map(input => input.value) }] });
      if (!data.targetTokenUuids) return null;
    }
  }
  if (phase.disposition && options.narrativeTokenUuids == null) {
    const local = phase.mode === "targets" ? null : await validateSkillResolution(actor, item, data, game.user);
    const candidates = (local ? eligibleAreaTokens(local.scene, local.source, { ...phase, disposition: null }, local.shapes)
      : (await Promise.all(data.targetTokenUuids.map(uuid => fromUuid(uuid)))).filter(Boolean))
      .filter(token => token.object?.visible && (![1, -1].includes(source.disposition) || ![1, -1].includes(token.disposition)));
    if (candidates.length) {
      data.narrativeTokenUuids = await foundry.applications.api.DialogV2.wait({ window: { title: `Confirm ${phase.disposition} creatures` }, rejectClose: false,
        content: `<p>Select creatures whose narrative relationship meets the source restriction.</p>${candidates.map(token => `<label><input type="checkbox" name="eligible" value="${esc(token.uuid)}">${esc(token.name)}</label>`).join("")}`,
        buttons: [{ action: "choose", label: "Confirm", callback: (_event, button) => [...button.form.querySelectorAll('input:checked')].map(input => input.value) }] });
      if (!data.narrativeTokenUuids) return null;
    }
  }
  return data;
}

/** Optional area actions place a fresh local preview before requesting their phase. */
export async function prepareSkillPhase(actor, item, receipt, options) {
  const profile = profileForSkill(item), phase = profile?.phases.find(phase => phase.id === options.phaseId);
  if (phase?.when !== "optional") return options;
  if (profile.notes.length && options.confirmation !== true && !await confirm(`<p>${esc(profile.sourceEffect)}</p><p>Confirm this phase's prerequisites and restrictions.</p>`)) return null;
  if (phase.mode !== "area") return options;
  const source = await fromUuid(receipt.sourceTokenUuid);
  if (!source?.actor) throw new Error("The original Skill source token is unavailable.");
  const geometry = phaseWeaponRange(actor, phase, options.weaponItemId ?? receipt.weaponItemId);
  const shapes = options.shapes ?? await previewSkillArea(geometry, source);
  if (!shapes) return null;
  return { ...options, shapes };
}

/** Run on the elected GM. Never read that GM's currently selected targets. */
export async function validateSkillResolution(actor, item, data, user, phaseId = "activation", receipt = null) {
  if (receipt?.privateMessageUuid) {
    const privateMessage = await fromUuid(receipt.privateMessageUuid);
    const selection = privateMessage?.flags?.ak5e?.privateSkillSelection;
    if (selection?.activationId === receipt.activationId) receipt = { ...receipt, selectedTargetUuids: selection.selectedTargetUuids, narrativeTokenUuids: selection.narrativeTokenUuids };
  }
  const profile = profileForSkill(item);
  if (!profile) return null;
  validateSkillPrerequisites(actor, { ...metadata(item), targetProfile: profile }, data.confirmation);
  let phase = profile.phases.find(phase => phase.id === phaseId);
  if (!phase) throw new Error("Unknown Skill phase.");
  phase = phaseWeaponRange(actor, phase, data.weaponItemId ?? receipt?.weaponItemId);
  phase = { ...phase, narrativeTokenUuids: data.narrativeTokenUuids ?? receipt?.narrativeTokenUuids ?? [] };
  if (!phase.mode) return { phaseId, profile, phase, targets: [], shapes: [] };
  const source = await fromUuid(data.sourceTokenUuid ?? receipt?.sourceTokenUuid);
  if (source?.documentName !== "Token" || source.actor?.uuid !== actor.uuid || source.parent?.documentName !== "Scene") throw new Error("The Skill source must be this Actor's token on a Scene.");
  const scene = source.parent;
  if (!user.isGM && !scene.testUserPermission(user, "OBSERVER")) throw new Error("The source scene is not accessible to this user.");
  if (phase.narrativeTokenUuids.some(uuid => !scene.tokens.some(token => token.uuid === uuid && token.actor && (user.isGM || !token.hidden)))) throw new Error("Confirm relationships only for visible creatures in the source Scene.");
  const selected = [];
  const relevantSelection = phase.mode !== "area" || phase.choice;
  for (const uuid of new Set(relevantSelection ? data.targetTokenUuids ?? receipt?.selectedTargetUuids ?? [] : [])) {
    const token = await fromUuid(uuid);
    if (token?.documentName !== "Token" || token.parent?.id !== scene.id || !token.actor || token.flags?.ak5e?.standardProp || !user.isGM && token.hidden) throw new Error("Select visible creatures on the source Scene.");
    selected.push(token);
  }
  const origin = tokenCenter(source);
  let shapes = [], targets = selected;
  if (["target-area", "paired-area"].includes(phase.mode)) {
    if (selected.length !== 1) throw new Error("Choose one source-legal anchor creature before activating.");
    if (phase.anchorCreatureType === "construct" && selected[0].actor.system.details?.type?.value && !isConstruct(selected[0].actor)) throw new Error("This Skill requires a Construct created by you.");
    if (phase.anchorDisposition === "ally" && source.disposition && selected[0].disposition && source.disposition !== selected[0].disposition) throw new Error("Choose a friendly anchor creature.");
    if (!receipt && phase.range != null && !rangeAllows(scene, tokenPoints(source), tokenPoints(selected[0]), phase.range)) throw new Error("The anchor creature is outside the Skill's range.");
    if (!receipt && !clearPath(origin, tokenCenter(selected[0]), list(scene.walls))) throw new Error("The anchor creature is blocked by a wall.");
    shapes = (phase.mode === "paired-area" ? [source, selected[0]] : [selected[0]]).map(token => ({ type: "circle", ...tokenCenter(token), distance: feetToPixels(scene, phase.distance), width: 0, direction: 0 }));
    targets = eligibleAreaTokens(scene, source, phase, shapes);
  } else if (phase.mode === "area") {
    shapes = structuredClone(data.shapes ?? receipt?.shapes ?? []);
    if (shapes.length !== (phase.templates ?? 1)) throw new Error("Place every area before activating the Skill.");
    for (const shape of shapes) {
      if (![shape.x, shape.y, shape.direction].every(Number.isFinite) || shape.type !== phase.shape) throw new Error("Invalid Skill geometry.");
      const maximumDistance = feetToPixels(scene, phase.distance);
      if (phase.variable && (!Number.isFinite(shape.distance) || shape.distance <= 0 || shape.distance > maximumDistance + 1e-7)) throw new Error("Choose a positive area length within the source maximum.");
      shape.distance = phase.variable ? shape.distance : maximumDistance; shape.width = feetToPixels(scene, phase.width ?? 5); shape.angle = phase.angle ?? 53.13;
      shape.coneType = phase.angle === 180 ? "round" : "flat";
      if (receipt && data.shapes && phase.anchor === "placed" && !phase.reposition && !receipt.shapes.some(original => original.x === shape.x && original.y === shape.y)) throw new Error("This phase cannot relocate its fixed area. Review source movement with the GM.");
      if (phase.anchor === "source" && (phase.moving || !receipt || ["ending", "optional"].includes(phase.when))) { shape.x = origin.x; shape.y = origin.y; }
      if (phase.anchor === "placed" && (!receipt || phase.reposition) && phase.range != null && !rangeAllows(scene, tokenPoints(source), [shape], phase.range)) throw new Error("The area is outside the Skill's range.");
      if (phase.anchor === "placed" && (!receipt || phase.reposition) && !phase.corners && !phase.piercing && !clearPath(origin, shape, list(scene.walls))) throw new Error("The placement is blocked by a wall.");
    }
    targets = eligibleAreaTokens(scene, source, phase, shapes);
    if (phase.choice) targets = targets.filter(token => selected.some(choice => choice.id === token.id));
  } else if (phase.mode === "self") targets = [source];
  else {
    if (!selected.length || phase.maximum != null && selected.length > phase.maximum) throw new Error(`Choose ${phase.maximum === 1 ? "one target" : `up to ${phase.maximum ?? "any number of"} targets`} before activating.`);
    for (const token of selected) {
      if (phase.range != null && !rangeAllows(scene, tokenPoints(source), tokenPoints(token), phase.range)) throw new Error("A target is outside the Skill's range.");
      if (!clearPath(origin, tokenCenter(token), list(scene.walls))) throw new Error("A target is blocked by a wall.");
      if (phase.allowedArea && !tokenPoints(token).some(point => receipt?.shapes.some(shape => containsPoint(shape, point)))) throw new Error("Choose a creature inside the original Skill area.");
    }
  }
  if (phase.healing && !item.flags.ak5e?.constructHealingException && targets.some(token => isConstruct(token.actor))) throw new Error("Constructs cannot regain HP from Operator Skills without an explicit source exception.");
  if (phase.disposition === "ally" && selected.some(token => source.disposition && token.disposition && source.disposition !== token.disposition)) throw new Error("Choose a source-legal allied creature.");
  if (phase.mode === "targets" && phase.disposition === "hostile" && selected.some(token => [1, -1].includes(source.disposition) && token.disposition === source.disposition)) throw new Error("Choose a hostile target.");
  if (phase.mode === "targets" && phase.disposition && selected.some(token => (![1, -1].includes(source.disposition) || ![1, -1].includes(token.disposition)) && !phase.narrativeTokenUuids.includes(token.uuid))) throw new Error("Confirm this target's narrative relationship before activation.");
  if (/Choose a Large or smaller Creature/i.test(profile.sourceEffect) && selected.some(token => ["huge", "grg"].includes(token.actor.system?.traits?.size))) throw new Error("Choose a Large or smaller creature.");
  if (phase.piercing && !user.isGM) throw new Error("A GM must confirm the piercing geometry and structure thickness.");
  return { phaseId, profile, phase, source, scene, targets, shapes, skillUuid: item.uuid };
}

export function skillTemplateData(resolution, activationId, userId) {
  const { scene, shapes } = resolution;
  return shapes.flatMap(shape => {
    const unit = scene.grid.distance / scene.grid.size;
    const document = { t: shape.type, x: shape.x, y: shape.y, direction: shape.direction,
      distance: shape.distance * unit, width: shape.width * unit, angle: shape.angle, user: userId,
      flags: { ak5e: { skillActivation: activationId, operatorArea: shape,
        skillOrigin: { skillUuid: resolution.skillUuid, activationId, phaseId: resolution.phaseId } }, dnd5e: { origin: resolution.skillUuid } } };
    if (shape.type === "cross") return [0, 90].map(rotation => {
      const angle = (shape.direction + rotation) * Math.PI / 180;
      return { ...document, t: "ray", direction: shape.direction + rotation,
        flags: { ...document.flags, ak5e: { ...document.flags.ak5e, operatorArea: { ...shape, type: "ray", direction: shape.direction + rotation } } },
        x: shape.x - Math.cos(angle) * shape.distance / 2, y: shape.y - Math.sin(angle) * shape.distance / 2 };
    });
    if (shape.type === "rect") { document.distance *= Math.SQRT2; document.direction += 45; }
    return [document];
  });
}
export function resolutionReceipt(resolution, data, activationId, item, user) {
  return { activationId, itemId: item.id, skillUuid: item.uuid, sourceId: metadata(item).sourceId, userId: user.id,
    sourceTokenUuid: resolution?.source?.uuid, sceneId: resolution?.scene?.id, shapes: resolution?.shapes ?? [],
    originPoint: resolution?.source ? tokenCenter(resolution.source) : null,
    weaponItemId: data.weaponItemId,
    narrativeTokenUuids: (data.narrativeTokenUuids ?? []).filter(uuid => resolution?.scene?.tokens?.some(token => token.uuid === uuid && !token.hidden)),
    selectedTargetUuids: (data.targetTokenUuids ?? []).filter(uuid => resolution?.scene?.tokens?.some(token => token.uuid === uuid && !token.hidden)),
    targetTokenUuids: resolution?.targets.filter(token => !token.hidden).map(token => token.uuid) ?? [],
    phases: {}, status: "prepared", createdAt: game.time.worldTime, profileVersion: resolution?.profile.version,
    startRound: game.combat?.round, startTurn: game.combat?.turn, combatUuid: game.combat?.uuid,
    bloodBoilDamage: 0 };
}
export function advanceSkillArea(resolution, receipt) {
  const movement = resolution.phase.areaMovement;
  if (!movement) return resolution;
  const origin = movement.reference === "initial" ? receipt.originPoint : tokenCenter(resolution.source);
  const step = feetToPixels(resolution.scene, movement.feet);
  const shapes = resolution.shapes.map(shape => {
    const dx = shape.x - origin.x, dy = shape.y - origin.y, length = Math.hypot(dx, dy);
    if (!length) throw new Error("The source does not establish an away direction at this point. The GM must resolve the area movement manually.");
    const next = { ...shape, x: shape.x + step * dx / length, y: shape.y + step * dy / length };
    if (!clearPath(shape, next, list(resolution.scene.walls))) throw new Error("The area movement reaches a wall; the GM must confirm its grounded or Arts movement rule.");
    return next;
  });
  return { ...resolution, shapes, targets: eligibleAreaTokens(resolution.scene, resolution.source, resolution.phase, shapes) };
}
export async function syncSkillTemplates(receipt, resolution) {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id || !resolution?.scene || !receipt.templateIds?.length) return;
  const data = skillTemplateData(resolution, receipt.activationId, receipt.userId);
  const updates = data.flatMap((entry, index) => {
    const template = resolution.scene.templates.get(receipt.templateIds[index]);
    if (!template || template.x === entry.x && template.y === entry.y && template.direction === entry.direction) return [];
    return [{ _id: template.id, x: entry.x, y: entry.y, direction: entry.direction, "flags.ak5e.operatorArea": entry.flags.ak5e.operatorArea }];
  });
  if (updates.length) await resolution.scene.updateEmbeddedDocuments("MeasuredTemplate", updates);
}
export function publicResolution(resolution, data, activationId, user) {
  return { activationId, phaseId: resolution?.phaseId ?? "activation", targetTokenUuids: resolution?.targets.filter(token => !token.hidden
    && (user.isGM || data.visibleTokenUuids?.includes(token.uuid))).map(token => token.uuid) ?? [] };
}

export async function displaySkillResolution(actor, receipt, resolution) {
  if (!resolution) return;
  const item = actor.items.get(receipt.itemId), origin = { skillUuid: item.uuid, activationId: receipt.activationId, phaseId: resolution.phaseId };
  await ChatMessage.implementation.create({ content: `<h3>${esc(item.name)}: ${esc(resolution.phaseId)}</h3><p>${esc(resolution.profile.sourceEffect)}</p><p>Affected: ${resolution.targets.map(token => esc(token.name)).join(", ") || "none"}</p><p>Resolve native rolls from the Operator tracker. Confirm damage, healing, and effects manually.</p>`,
    whisper: list(game.users).filter(user => user.isGM).map(user => user.id), flags: { ak5e: { skillOrigin: origin,
      skillResolution: { actorUuid: actor.uuid, activationId: receipt.activationId, phaseId: resolution.phaseId, targetTokenUuids: resolution.targets.map(token => token.uuid) } } } });
}

/** Explicit migration only. Existing user activities are compared, never replaced. */
export function previewOperatorSkillUpdate(actor) {
  if (!game.user.isGM) throw new Error("Only a GM can update managed Skills.");
  return list(actor.items).flatMap(item => {
    const profile = profileForSkill(item);
    if (!profile) return [];
    const additions = Object.fromEntries(Object.entries(nativePhaseActivities(profile)).filter(([id]) => !item.system.activities?.get?.(id)));
    return [{ itemId: item.id, name: item.name, sourceId: profile.sourceId, activities: Object.keys(additions),
      update: { _id: item.id, "flags.ak5e.operatorTargetProfile": profile,
        ...Object.fromEntries(Object.entries(additions).map(([id, data]) => [`system.activities.${id}`, data])) } }];
  });
}
export async function updateOperatorSkills(actor, { preview = true } = {}) {
  const changes = previewOperatorSkillUpdate(actor);
  if (preview) return changes;
  await actor.updateEmbeddedDocuments("Item", changes.map(change => change.update));
  return changes.map(({ update, ...change }) => change);
}

export async function rollSkillPhase(actor, receipt, phaseId, targetTokenUuids, options = {}) {
  const item = actor.items.get(receipt.itemId), profile = structuredClone(profileForSkill(item));
  const index = profile.phases.findIndex(phase => phase.id === phaseId), phase = profile.phases[index];
  if (!phase) throw new Error("Unknown Skill phase.");
  if (profile.sourceName === "Blood Boil" && phaseId === "ending") {
    phase.damage = String(receipt.bloodBoilDamage * 2); phase.damageType = "fire"; phase.manualRoll = false;
  }
  const origin = { skillUuid: item.uuid, activationId: receipt.activationId, phaseId };
  const targets = (await Promise.all(targetTokenUuids.map(uuid => fromUuid(uuid)))).filter(token => token?.actor && token.object?.visible);
  populateSkillTargets(targets);
  const activityId = `ak5ePhase${String(index).padStart(7, "0")}`;
  const additions = nativePhaseActivities(profile);
  const saved = item.toObject().system.activities;
  const clone = item.clone({ "system.activities": { ...additions, ...saved,
    ...(profile.sourceName === "Blood Boil" && phaseId === "ending" ? { [activityId]: additions[activityId] } : {}) } }, { keepId: true });
  const activity = clone.system.activities.get(activityId);
  const message = { data: { flags: { ak5e: { skillOrigin: origin }, dnd5e: {
    item: { uuid: item.uuid, id: item.id, type: item.type }, activity: { uuid: activity.uuid, id: activity.id, type: activity.type },
    targets: targets.map(token => ({ uuid: token.actor.uuid, name: token.name, img: token.texture.src })) } } } };
  if (targets.some(token => token.hidden)) {
    message.rollMode = "gmroll"; message.data.whisper = list(game.users).filter(user => user.isGM).map(user => user.id);
  }
  let dc = null;
  const dialog = { configure: options.configure !== false };
  if (phase.save) {
    if (phase.dc === "spell") dc = spellSaveDC(actor);
    else if (options.dcType === "spell" && phase.dc === "choice") dc = spellSaveDC(actor);
    else if (["martial", "choice"].includes(phase.dc) && ["str", "dex"].includes(options.martialAbility)) dc = 8 + Number(actor.system.attributes.prof) + Number(actor.system.abilities[options.martialAbility].mod);
    else if (phase.dc === "manual" && game.user.isGM && Number.isFinite(options.dc)) dc = options.dc;
    if (dc == null) throw new Error("Select the source-allowed DC and Martial ability, or have the GM establish an omitted DC.");
  }
  if (phase.weapon) {
    const weapon = actor.items.get(options.weaponItemId);
    const attack = list(weapon?.system.activities).find(activity => activity.type === "attack");
    if (weapon?.type !== "weapon" || !attack) throw new Error("Choose a source-legal weapon with an attack activity.");
    if (phase.sharedAttack) {
      populateSkillTargets(targets);
      await attack.rollAttack({}, dialog, { data: { flags: { ak5e: { skillOrigin: origin } }, ...(message.data.whisper ? { whisper: message.data.whisper } : {}) } });
    } else for (const target of targets) {
      populateSkillTargets([target]);
      await attack.rollAttack({}, dialog, { data: { flags: { ak5e: { skillOrigin: origin } }, ...(message.data.whisper ? { whisper: message.data.whisper } : {}) } });
    }
    populateSkillTargets(targets);
    return { targetTokenUuids: targets.map(token => token.uuid), manual: "Confirm special damage, attack modifiers and triggered areas against the Skill source." };
  }
  if (phase.save) for (const token of targets) if (token.actor.isOwner) await token.actor.rollSavingThrow({ ability: phase.save, target: dc }, dialog, message);
  if (phase.healing) for (let i = 0; i < (phase.instances ?? 1); i++) await activity.rollDamage({}, dialog, message);
  else if (phase.damage && !phase.manualRoll && !phase.weapon) await activity.rollDamage({}, dialog, message);
  else if (phase.manualRoll || !phase.healing && !phase.damage) await item.displayCard({ flags: { ak5e: { skillOrigin: origin } } });
  // Unowned saves remain owner/GM actions. Never mutate HP or effects from a resolution.
  return { dc, targetTokenUuids: targets.map(token => token.uuid), unownedSaves: phase.save ? targets.filter(token => !token.actor.isOwner).map(token => token.uuid) : [] };
}
