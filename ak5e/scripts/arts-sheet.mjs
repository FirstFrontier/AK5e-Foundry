import { artsState } from "./arts-rules.mjs";
import { artAvailability, artsErrorText, artsText as t, adjustActorArts, equipActorCastingUnit,
  grantFor, hasArtsContent, openActorArts, openArtsSetup, openArtRules, recoverActorArts, setActorArtsValue } from "./arts-casting.mjs";

const filters = new WeakMap();
const originals = new WeakMap();
const originalLabels = new WeakMap();
let installed = false;
const items = actor => Array.from(actor.items?.values?.() ?? actor.items ?? []);
const isAdopted = item => item.type === "spell" && item.system.method === "ak5e" && item.getFlag?.("ak5e", "art")?.enabled !== false;
const part = (root, selector) => root.matches?.(selector) ? root : root.querySelector(selector);
const nodes = (root, selector) => [...(root.matches?.(selector) ? [root] : []), ...root.querySelectorAll(selector)];
const safe = fn => Promise.resolve().then(fn).catch(error => { console.error("AK5e | Arts UI", error); ui.notifications.error(artsErrorText(error)); });
const node = (tag, text, cls) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (cls) element.className = cls;
  return element;
};

function actorFor(app) {
  const actor = app?.document;
  return app instanceof foundry.applications.sheets.ActorSheetV2 && actor?.documentName === "Actor"
    && ["character", "npc"].includes(actor.type) ? actor : null;
}

function button(label, action, cls = "") {
  const element = node("button", label, cls);
  element.type = "button";
  element.addEventListener("click", event => {
    event.preventDefault(); event.stopPropagation();
    element.disabled = true;
    safe(action).finally(() => { element.disabled = false; });
  });
  return element;
}

function resource(actor, state, app) {
  const bar = node("div", undefined, "ak5e-ap-bar");
  bar.append(node("span", t("AP")));
  if (actor.isOwner) {
    const input = node("input");
    Object.assign(input, { type: "number", min: "0", max: String(Math.max(state.maximum, state.value)), step: "1", value: String(state.value) });
    input.setAttribute("aria-label", t("CurrentAP"));
    // No name: native sheet submission must never write an AK5e input.
    input.addEventListener("change", event => {
      event.preventDefault(); event.stopPropagation();
      input.disabled = true;
      safe(() => setActorArtsValue(actor, input.value)).finally(() => {
        input.disabled = false; input.value = String(artsState(actor).value);
      });
    });
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); input.blur(); }
    });
    bar.append(input);
  } else bar.append(node("span", String(state.value)));
  bar.append(node("span", `/ ${state.maximum}`));
  if (actor.isOwner) {
    for (const delta of [-1, 1]) {
      const control = button(delta === -1 ? "−" : "+", () => adjustActorArts(actor, delta));
      control.setAttribute("aria-label", t(delta === -1 ? "SpendOne" : "RestoreOne"));
      control.disabled = delta < 0 ? state.value === 0 : state.value >= state.maximum;
      bar.append(control);
    }
  }
  if (app) bar.append(button(t("Title"), () => app.changeTab("spells", "primary")));
  return bar;
}

function summary(actor, state) {
  const panel = node("section", undefined, "ak5e-arts-controls");
  const top = resource(actor, state);
  if (actor.isOwner) top.append(button("⚙", () => openActorArts(actor), "ak5e-arts-settings"));
  top.querySelector(".ak5e-arts-settings")?.setAttribute("aria-label", t("Settings"));
  panel.append(top);
  if (actor.getFlag("ak5e", "artsSetup")?.status === "pending") {
    panel.append(node("p", t("PendingSetup"), "ak5e-arts-warning"));
    if (actor.isOwner) panel.append(button(t("Setup"), () => openActorArts(actor)));
  }
  const ability = CONFIG.DND5E.abilities?.[state.ability]?.label ?? state.ability;
  panel.append(node("p", t("Summary", { maximumArtLevel: state.maximumArtLevel, ability, recovery: t(`Recovery.${state.recovery}`) })));
  if (state.maximumArtLevel === 9 || items(actor).some(i => isAdopted(i) && i.system.level > 0 && grantFor(i, actor).free?.level === 9)) {
    panel.append(node("p", t(state.ninthLevelCast ? "NinthUsed" : "NinthAvailable")));
  }
  const focus = actor.items.get(state.castingUnit);
  const focusRow = node("div", undefined, "ak5e-focus-row");
  focusRow.append(node("span", t("FocusStatus", { name: focus?.name ?? t("None"), status: t(focus?.system.equipped ? "Equipped" : "NotEquipped") })));
  if (actor.isOwner) {
    if (focus && !focus.system.equipped && ["weapon", "equipment", "tool"].includes(focus.type)) {
      focusRow.append(button(t("Equip"), () => equipActorCastingUnit(actor)));
    }
    focusRow.append(button(t("ChooseUnit"), () => openArtsSetup(actor, { adopt: false })));
  }
  panel.append(focusRow);
  if (actor.statuses?.has("ak5e-silenced")) panel.append(node("p", t("Silenced"), "ak5e-arts-warning"));
  else if (!focus?.system.equipped) panel.append(node("p", t("FocusHint"), "ak5e-arts-warning"));
  if (actor.type === "npc" && actor.isOwner) {
    const recovery = node("details", undefined, "ak5e-arts-recovery");
    recovery.append(node("summary", t("RecoverArts")), node("p", t("RecoveryHint")));
    for (const type of ["short", "long"]) recovery.append(button(t(`Rest.${type}`), () => recoverActorArts(actor, type)));
    panel.append(recovery);
  }
  return panel;
}

function references(actor, tab) {
  if (actor.type !== "npc") return;
  const features = items(actor).filter(i => i.type === "feat"
    && ((i.getFlag?.("ak5e", "npcFeature") && /^Spellcasting\b/i.test(i.name)) || /\(Art\)/i.test(i.name)));
  if (!features.length) return;
  const section = node("details", undefined, "ak5e-arts-references");
  section.append(node("summary", t("Statblock")), node("p", t("ReferenceHint")));
  for (const item of features) section.append(button(item.name, () => item.sheet.render(true)));
  tab.append(section);
}

function decorateRows(actor, tab, app) {
  for (const row of tab.querySelectorAll("[data-item-id]")) {
    const item = actor.items.get(row.dataset.itemId);
    if (!item || !isAdopted(item)) continue;
    row.classList.add("ak5e-art-row");
    const availability = artAvailability(actor, item);
    const grant = grantFor(item, actor);
    const badge = node("div", undefined, "ak5e-art-status");
    const ap = availability.modes.find(m => m.value === "ap");
    const base = ap?.quotes.find(q => q.level === item.system.level);
    if (base) badge.append(node("span", t("Cost", base)));
    if (grant.free) {
      badge.append(node("span", grant.free.maximum === null ? t("UnlimitedFree")
        : t("FreeRemaining", { remaining: Math.max(0, grant.free.maximum - grant.free.spent), maximum: grant.free.maximum })));
    }
    if (grant.ritual) badge.append(node("span", t("Mode.ritual")));
    if (!availability.castable) badge.append(node("span", artsErrorText(availability.error), "ak5e-arts-warning"));
    else if (!base && ap?.error && !grant.onlyFree) badge.append(node("span", artsErrorText(ap.error)));
    if (!item.system.activities?.size) badge.append(node("span", t("NoActivity")));
    row.dataset.ak5eCastable = String(availability.castable && Boolean(item.system.activities?.size));
    // Keep the native name/activity click and expand controls intact.
    (row.querySelector(".item-row > .item-name") ?? row.querySelector(".item-name") ?? row).append(badge);
    for (const control of row.querySelectorAll('[data-action="prepare"]')) control.classList.add("ak5e-arts-hide");
    if (actor.isOwner && game.user.isGM) {
      const rules = button(t("CastingRules"), () => openArtRules(actor, item.id), "ak5e-art-rules");
      (row.querySelector('.item-row > [data-column-id="controls"]') ?? row).append(rules);
    }
  }
  for (const section of tab.querySelectorAll(".items-section")) {
    const ordinary = [...section.querySelectorAll("[data-item-id]")].some(row => {
      const item = actor.items.get(row.dataset.itemId);
      return item?.type === "spell" && !isAdopted(item);
    });
    if (ordinary) continue;
    for (const slots of section.querySelectorAll('.items-header .pips[data-prop^="system.spells."], .items-header [data-config="spellSlots"]')) {
      slots.classList.add("ak5e-arts-hide");
    }
  }
  if (!items(actor).some(i => i.type === "spell" && !isAdopted(i))) {
    for (const prep of tab.querySelectorAll('.spellcasting .prepared, .spellcasting .level, option[value="prepared"]')) prep.classList.add("ak5e-arts-hide");
    for (const [selector, key] of [['.spellcasting .header h3', 'Casting'], ['.spellcasting .save .label', 'ArtsDC']]) {
      for (const label of tab.querySelectorAll(selector)) {
        originalLabels.set(label, label.textContent);
        label.classList.add("ak5e-arts-label"); label.textContent = t(key);
      }
    }
  }
  const filter = node("label", undefined, "ak5e-castable-filter");
  const checkbox = node("input");
  checkbox.type = "checkbox"; checkbox.checked = filters.get(app) === true;
  checkbox.addEventListener("change", event => {
    event.stopPropagation(); filters.set(app, checkbox.checked); applyFilter(tab, checkbox.checked);
  });
  filter.append(checkbox, node("span", t("CastableNow")));
  (tab.querySelector(".inventory-element > .middle") ?? tab.querySelector(".ak5e-arts-controls") ?? tab).append(filter);
  applyFilter(tab, checkbox.checked);
}

function applyFilter(tab, enabled) {
  for (const row of tab.querySelectorAll(".ak5e-art-row")) {
    row.classList.toggle("ak5e-arts-filtered", enabled && row.dataset.ak5eCastable !== "true");
  }
}

function restore(root) {
  for (const injected of root.querySelectorAll(".ak5e-arts-controls, .ak5e-arts-header, .ak5e-art-status, .ak5e-art-rules, .ak5e-castable-filter, .ak5e-arts-references, .ak5e-arts-empty")) injected.remove();
  for (const element of root.querySelectorAll(".ak5e-arts-hide, .ak5e-arts-filtered, .ak5e-art-row")) {
    element.classList.remove("ak5e-arts-hide", "ak5e-arts-filtered", "ak5e-art-row");
    delete element.dataset.ak5eCastable;
  }
  for (const link of root.querySelectorAll('nav [data-tab="spells"]')) {
    const original = originals.get(link);
    if (original) {
      link.setAttribute("aria-label", original.label);
      link.title = original.title;
      originals.delete(link);
    }
  }
  for (const label of root.querySelectorAll(".ak5e-arts-label")) {
    label.textContent = originalLabels.get(label) ?? label.textContent;
    label.classList.remove("ak5e-arts-label"); originalLabels.delete(label);
  }
}

export function renderArtsControls(app, element) {
  const actor = actorFor(app);
  if (!actor || !element?.querySelector) return;
  // V13 may supply a part; refresh surviving header/navigation from the same app.
  const roots = app.element?.contains(element) ? [app.element] : [element];
  if (app.element?.querySelector && app.element !== element && !app.element.contains(element) && !element.contains(app.element)) roots.push(app.element);
  for (const root of roots) restore(root);
  if (actor.limited && !game.user.isGM) return;
  const state = artsState(actor);
  const relevant = hasArtsContent(actor);
  if (!relevant) return;
  for (const root of roots) {
    const tab = part(root, '.tab[data-tab="spells"]');
    if (!state.enabled) {
      if (relevant && tab && actor.isOwner) {
        const prompt = node("section", undefined, "ak5e-arts-controls");
        prompt.append(node("p", t("SetupHint")), button(t("Setup"), () => openActorArts(actor)));
        tab.prepend(prompt);
      }
      continue;
    }
    for (const link of nodes(root, 'nav [data-tab="spells"]')) {
      originals.set(link, { label: link.getAttribute("aria-label") ?? "", title: link.title });
      link.setAttribute("aria-label", t("Title")); link.title = t("Title");
    }
    const header = part(root, ".sheet-header");
    if (header) {
      const bar = resource(actor, state, app); bar.classList.add("ak5e-arts-header");
      (header.querySelector(".right.stats > .top .sheet-header-buttons")
        ?? (actor.type === "character" ? header.querySelector(":scope > .left") : null)
        ?? header.querySelector(".right") ?? header).append(bar);
    }
    if (!tab) continue;
    tab.prepend(summary(actor, state));
    if (!items(actor).some(isAdopted)) tab.append(node("p", t("Empty"), "ak5e-arts-empty"));
    decorateRows(actor, tab, app);
    references(actor, tab);
  }
}

export function registerArtsSheetHooks() {
  if (installed) return;
  installed = true;
  Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
    const actor = actorFor(app);
    if (!actor?.isOwner || !hasArtsContent(actor) || controls.some(c => c.action === "ak5eArts")) return;
    controls.unshift({ action: "ak5eArts", icon: "fa-solid fa-wand-magic-sparkles", label: t("Settings"), ownership: "OWNER", onClick: () => safe(() => openActorArts(actor)) });
  });
  Hooks.on("renderActorSheetV2", renderArtsControls);
}
