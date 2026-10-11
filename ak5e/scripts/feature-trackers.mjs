import { CHAPTER_TWO_ORIGINS as ORIGINS } from "./chapter-two-content.mjs";
import { CHAPTER_THREE_CLASSES as CLASSES } from "./chapter-three-content.mjs";
import { tagActors, saveAegirRelationship, openFeatureTagSetup, registerFeatureTagHooks } from "./feature-tags.mjs";

const flag = (doc, key) => doc?.getFlag?.("ak5e", key) ?? doc?.flags?.ak5e?.[key];
const entries = collection => Array.from(collection?.values?.() ?? collection ?? []);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const level = actor => Math.max(1, Number(actor.system?.details?.level) || 1);
const prof = actor => Math.max(0, Number(actor.system?.attributes?.prof) || 0);
const safely = promise => promise.catch(error => { console.error("AK5e | Feature trackers", error); ui.notifications.error(error.message); });
const busy = new Set();
const localize = key => game.i18n.localize(`AK5E.Trackers.${key}`);
const tierUses = "1 + min(1, floor(@details.level / 7))";

// Reviewed against the complete Chapter 2 source. This is a catalogue, not a
// prose parser: e.g. performing a Short Rest Activity need not recover on SR.
export const ORIGIN_USES = {
  "species-feature-anura-toxin-glands": ["Toxin Glands", "1", "sr"],
  "species-feature-archosauria-exult-in-violence": ["Exult in Violence", "@prof", "lr"],
  "species-feature-caprinae-in-their-blood": ["Inherent Magic: free casting", "1", "sr"],
  "species-feature-durin-don-t-look-down-on-me": ["Don't Look Down on Me!", "@prof", "lr"],
  "species-feature-kuranta-until-the-last-breath": ["Until the Last Breath", "1", "lr"],
  "species-feature-liberi-preening-feathers": ["Preening Feathers", "1", "lr"],
  "species-feature-oni-journey-s-end": ["Bloodfury", "1", "lr"],
  "species-feature-perro-survive-and-adapt": ["Survive and Adapt", "1", "sr"],
  "species-feature-sankta-lawbringers": ["Lawbringers", "@prof", "lr"],
  "species-feature-sarkaz-witchcraft": ["Witchcraft: free casting", tierUses, "lr"],
  "species-feature-sarkaz-clanless-born-survivors": ["Born Survivors", "1", "lr"],
  "species-feature-sarkaz-cyclopes-divine-the-spirits": ["Divine the Spirits", "1", "sr"],
  "species-feature-sarkaz-gargoyle-to-mold-mud-and-rock": ["Earthen Golem", "1", "lr"],
  "species-feature-sarkaz-gargoyle-to-speak-with-stone": ["To Speak with Stone: free casting", "1", "sr"],
  "species-feature-sarkaz-nachzehrer-in-death-life-in-life-death": ["Consume a corpse", "1", "sr"],
  "species-feature-vouivre-tough-as-nails": ["Tough as Nails", "1", "sr"],
  "species-feature-vulpo-inescapable": ["Inescapable", "1", "sr"],
  "species-feature-zalak-hyperfocus": ["Spring-Loaded", "1", "sr"],
  // The source exporter splits the recovery paragraph into Dance Partner.
  "species-feature-abyssal-hunter-dance-partner": ["Battle Rhythm / Dance Partner", "1", "sr"],
  "species-feature-elf-guardian-of-terra": ["Elven Magic: free casting", "1", "sr"],
  "species-feature-draco-dragon-s-rage": ["Dragon's Rage: free casting", "1", "sr"],
  "species-feature-k-uk-ulkan-stormborne": ["Stormborne: free casting", "1", "lr"],
  "species-feature-lung-weight-of-history": ["Learn From the Past", "1", "lr"],
  "species-feature-nightzmora-kuranta-illusory-arts": ["Illusory Arts: free casting", "1", "sr"],
  "nationality-kjerag": ["One Nation under Kjeragandr", "1", "lr"],
  "nationality-yan": ["Wide, Vast Land", "1", "lr"],
  "background-gir-sage": ["Legacy of the Predecessors", "1", "sr"],
  "background-military-school-graduate": ["Acumen (Officer)", "3", "lr"],
  "background-samurai": ["Pride", "2", "lr"],
  "background-pontifica-cohors-lateran": ["Legion of Heaven", "1", "sr"],
  "background-taran-nationalist": ["Great Flame of Tara", "1", "lr"],
  "background-martial-arts-practitioner": ["Wuxia", "@prof", "lr"],
  "background-entertainer": ["Finger on the Pulse", "1", "lr"]
};

export function nativeOriginUses(sourceId) {
  const definition = ORIGIN_USES[sourceId];
  return definition ? { spent: 0, max: definition[1], recovery: [{ period: definition[2], type: "recoverAll" }] } : null;
}

const skillNames = ["Acrobatics", "Animal Handling", "Arts", "Athletics", "Deception", "Insight", "Intimidation", "Investigation", "Lore", "Medicine", "Perception", "Performance", "Persuasion", "Sleight of Hand", "Stealth", "Technology", "Wilderness"];
const textField = (key, label) => ({ key, label, type: "text" });
const listField = (key, label, maximum) => ({ key, label, type: "list", maximum });
const selectField = (key, label, options) => ({ key, label, type: "select", options });
export const ORIGIN_RECORDS = {
  "species-feature-aegir-ever-the-student-ever-the-master": {
    hint: "Choose a willing creature as a Long Rest Activity. You can have one Student or Teacher; saving a new choice replaces the old one. A linked creature receives the removable proficiency or expertise benefit; record-only choices are resolved manually.",
    fields: [selectField("role", "Your role", ["Student", "Teacher"]), textField("creature", "Creature"), selectField("skill", "Skill", skillNames)]
  },
  "species-feature-aegir-logic-engine": {
    hint: "Study an unproficient weapon, armour, or toolkit as a Short Rest Activity. List oldest first; remove the oldest when replacing it. Apply proficiency manually.",
    fields: [listField("items", "Studied items (one per line)", actor => level(actor) >= 7 ? 2 : 1)]
  },
  "species-feature-liberi-birds-of-a-feather": {
    hint: "Gift a feather when finishing a Long Rest. A creature can belong to only one Flock. Track each member's benefit expenditure on their sheet or manually.",
    fields: [listField("flock", "Flock members (one per line; exclude yourself)", actor => Math.ceil(prof(actor) / 2))],
    counters: [{ key: "prey", label: "Birds of Prey", maximum: 1, recovery: "sr" }, { key: "nest", label: "Nestmakers", maximum: 1, recovery: "sr" }]
  },
  "species-feature-sarkaz-nachzehrer-in-death-life-in-life-death": {
    hint: "Gain Rot equal to a consumed corpse's CR or level (minimum 1); spend it when casting Necrotic Arts. Rot has no stated rest recovery. Resolve casting bonuses manually.",
    fields: [], counters: [{ key: "rot", label: "Rot", maximum: level, initial: 0 }]
  },
  "species-feature-sarkaz-cyclopes-bad-luck": {
    hint: "Record one d20 result per Bad Luck point, keeping duplicate results. Remove only the first matching point after an affected roll (excluding death saves). Clears on a Long Rest.",
    fields: [{ key: "rolls", label: "Bad Luck results (one per line)", type: "d20list" }], clearOnLongRest: true
  },
  "species-feature-sarkaz-vampire-haematophage": {
    hint: "Bloody Inspiration is separate from normal Inspiration; it expires only when it causes a roll to succeed. Blood drain and rolls are manual.",
    fields: [selectField("inspiration", "Bloody Inspiration", ["Available", "Unavailable"])]
  },
  "species-feature-phidia-agendum": {
    hint: "Choose an Agenda with your GM. Record special Inspiration awarded for major tasks; it expires only when it causes a d20 roll to succeed.",
    fields: [textField("agenda", "Agenda"), textField("inspiration", "Special Inspiration record")]
  },
  "species-feature-lung-xue-wu-zhi-jing": {
    hint: "Write or study a permitted Treatise as a Long Rest Activity. Only one is studied at a time; saving a new study replaces it. Resolve its feature and the writing cost manually.",
    fields: [textField("studied", "Currently studied Treatise"), listField("written", "Written Treatises (one per line)")]
  },
  "species-feature-abyssal-hunter-battle-rhythm": {
    hint: "Roll 1d4+1 on Initiative, or copy a Dance Partner's Rhythm by expending the same use. Track On Beat rounds and bonuses manually; clear the Rhythm when combat ends.",
    fields: [selectField("rhythm", "Current combat Rhythm", ["2", "3", "4", "5"])]
  },
  "background-knight-of-kazimierz": {
    hint: "Only one vow can be active. The bonus starts at +10 and is permanently reduced by 5 for each broken vow, to a minimum of 0. Resolve bonuses manually.",
    fields: [textField("creature", "Vow made to"), textField("vow", "Active vow"), selectField("bonus", "Remaining bonus", ["10", "5", "0"])]
  }
};

export function featureSource(item) {
  const direct = flag(item, "chapterTwoId") ?? (flag(item, "temporaryTag")?.preset === "treatise" ? flag(item, "borrowedFeatureId") : null);
  if (direct) return ORIGINS.find(e => e.id === direct);
  const grant = flag(item, "originGrant");
  if (grant) {
    const origin = ORIGINS.find(e => e.id === grant.originId);
    if (origin?.kind === "species") return ORIGINS.find(e => e.kind === "species-feature" &&
      [origin.name, origin.parent].includes(e.parent) && e.name === item.name);
    // Background grant 0 contains the background feat; equipment/tactics do not.
    if (origin?.kind === "background" && grant.index === 0 && item.type === "feat") return origin;
  }
  return CLASSES.find(e => e.id === flag(item, "chapterThreeId"));
}

export function isAk5eFeature(item) {
  return item?.type === "feat" && Boolean(featureSource(item) || flag(item, "rawSource") || flag(item, "originGrant"));
}

function configuredUses(item) {
  const source = item._source?.system?.uses ?? item.system?.uses;
  return source?.max !== undefined && source.max !== null && String(source.max).trim() !== "";
}

function formulaMaximum(formula, actor) {
  if (formula === "@prof") return prof(actor);
  if (formula === tierUses) return level(actor) >= 7 ? 2 : 1;
  return Number(formula);
}

function assertOwner(actor, item) {
  if (actor?.type !== "character" || !actor.isOwner || item?.parent !== actor || actor.items.get(item.id) !== item) {
    throw new Error("Change trackers on a feature belonging to a character you own.");
  }
}

// No writes during rendering, and no name-based opt-in for stock D&D5e items.
export function featureTrackers(actor) {
  const items = entries(actor.items);
  const tracked = [];
  for (const item of items) {
    if (item.dependentOrigin?.active === false) continue;
    const entry = featureSource(item);
    if (!entry && !isAk5eFeature(item)) continue;
    if (entry && ["species", "background"].includes(entry.kind)) {
      // Prefer the granted feature over a duplicate background resource.
      if (items.some(other => other !== item && flag(other, "originGrant")?.originId === entry.id &&
          flag(other, "originGrant")?.index === 0 && other.type === "feat")) continue;
    }
    const definition = ORIGIN_USES[entry?.id];
    // Officer is a bonus to an existing Tactician pool, never a second pool.
    const tactician = entry?.id === "background-military-school-graduate" && items.some(other =>
      other.type === "subclass" && (other.system?.identifier === "tactician" || flag(other, "parentBranch") === "Tactician" || other.name === "Tactician"));
    if (!tactician && (configuredUses(item) || definition)) {
      const source = item._source?.system?.uses ?? item.system?.uses ?? {};
      const maximum = configuredUses(item)
        ? typeof item.system?.uses?.max === "number" ? item.system.uses.max : formulaMaximum(source.max, actor)
        : formulaMaximum(definition[1], actor);
      if (Number.isFinite(maximum) && maximum >= 0) tracked.push({ item, key: "uses", label: definition?.[0] ?? item.name,
        maximum, value: Math.min(maximum, Math.max(0, maximum - (Number(source.spent) || 0))),
        recovery: configuredUses(item) ? source.recovery?.map(r => r.period).join(", ") : definition[2] });
    }
    const record = ORIGIN_RECORDS[entry?.id];
    for (const counter of record?.counters ?? []) {
      const maximum = typeof counter.maximum === "function" ? counter.maximum(actor) : counter.maximum;
      const value = flag(item, "featureTracking")?.counters?.[counter.key] ?? counter.initial ?? maximum;
      tracked.push({ item, ...counter, maximum, value: Math.min(maximum, Math.max(0, value)) });
    }
    if (record?.fields.length) tracked.push({ item, key: "record", label: entry.name, record,
      values: flag(item, "featureTracking")?.values ?? {} });
  }
  return tracked;
}

export async function setFeatureCounter(actor, itemId, key, value) {
  const item = actor.items.get(itemId);
  assertOwner(actor, item);
  const tracker = featureTrackers(actor).find(t => t.item === item && t.key === key && !t.record);
  if (!tracker) throw new Error("This feature no longer has that tracker.");
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 0 || amount > tracker.maximum) throw new Error(`Enter a whole number from 0 to ${tracker.maximum}.`);
  if (key === "uses") {
    const update = { "system.uses.spent": tracker.maximum - amount };
    if (!configuredUses(item)) {
      const uses = nativeOriginUses(featureSource(item)?.id);
      update["system.uses.max"] = uses.max;
      update["system.uses.recovery"] = uses.recovery;
    }
    return item.update(update);
  }
  return item.update({ [`flags.ak5e.featureTracking.counters.${key}`]: amount });
}

export async function saveFeatureRecord(actor, itemId, values) {
  const item = actor.items.get(itemId);
  assertOwner(actor, item);
  const record = ORIGIN_RECORDS[featureSource(item)?.id];
  if (!record) throw new Error("This feature no longer has a choice tracker.");
  const next = {};
  if (record.fields.some(f => f.key === "role") && values.targetUuid) {
    const partner = await fromUuid(values.targetUuid);
    values = { ...values, creature: partner?.name ?? values.creature };
  }
  for (const field of record.fields) {
    const value = String(values[field.key] ?? "").trim();
    if (value.length > 2000) throw new Error(`${field.label}: keep the record under 2000 characters.`);
    if (field.type === "select" && value && !field.options.includes(value)) throw new Error(`${field.label}: choose a listed option.`);
    if (field.type === "list" || field.type === "d20list") {
      const lines = value.split("\n").map(v => v.trim()).filter(Boolean);
      const maximum = field.maximum?.(actor);
      if (maximum !== undefined && lines.length > maximum) throw new Error(`${field.label}: maximum ${maximum}.`);
      if (field.type === "d20list" && lines.some(v => !/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 20)) throw new Error("Bad Luck results must be whole numbers from 1 to 20.");
      next[field.key] = lines.join("\n");
    } else next[field.key] = value;
  }
  if (record.fields.some(f => f.key === "role") && Object.values(next).some(Boolean) && (!next.role || !next.creature || !next.skill)) {
    throw new Error("Choose a role, creature, and skill, or clear all three to end the relationship.");
  }
  if (record.fields.some(f => f.key === "role")) return saveAegirRelationship(actor, item, next, values.targetUuid);
  return item.update({ "flags.ak5e.featureTracking.values": next });
}

export async function recoverFeatureTrackers(actor, _result, config = {}) {
  if (actor?.type !== "character" || !actor.isOwner) return;
  const periods = new Set(CONFIG.DND5E.restTypes?.[config.type]?.recoverPeriods ?? []);
  if (config.recoverShortRestUses) periods.add("sr");
  if (config.recoverLongRestUses) periods.add("lr");
  const updates = [];
  for (const item of entries(actor.items)) {
    if (item.dependentOrigin?.active === false) continue;
    const stored = flag(item, "featureTracking");
    if (!stored) continue;
    const record = ORIGIN_RECORDS[featureSource(item)?.id];
    const update = { _id: item.id };
    for (const counter of record?.counters ?? []) {
      if (!counter.recovery || !periods.has(counter.recovery) || stored.counters?.[counter.key] === undefined) continue;
      update[`flags.ak5e.featureTracking.counters.${counter.key}`] = typeof counter.maximum === "function" ? counter.maximum(actor) : counter.maximum;
    }
    if (config.type === "long" && record?.clearOnLongRest && stored.values?.rolls) update["flags.ak5e.featureTracking.values.rolls"] = "";
    if (Object.keys(update).length > 1) updates.push(update);
  }
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
}

export async function configureFeatureCounter(actor, itemId, { label, maximum, value, recovery }) {
  const item = actor.items.get(itemId);
  assertOwner(actor, item);
  if (!isAk5eFeature(item)) throw new Error("Select an AK5e feature.");
  if (!String(label ?? "").trim() || String(label).length > 120) throw new Error("Give the tracker a name of 1–120 characters.");
  if (![maximum, value].every(v => Number.isInteger(Number(v)) && Number(v) >= 0) || Number(value) > Number(maximum)) throw new Error("Use whole numbers with remaining no greater than maximum.");
  if (!["", "sr", "lr"].includes(recovery)) throw new Error("Choose manual, Short Rest, or Long Rest recovery.");
  // Native Item uses are a single pool. The dialog never creates a second pool.
  return item.update({ "system.uses.max": String(maximum), "system.uses.spent": Number(maximum) - Number(value),
    "system.uses.recovery": recovery ? [{ period: recovery, type: "recoverAll" }] : [],
    "flags.ak5e.featureTracking.label": String(label).trim() });
}

export function characterResourceTrackers(actor) {
  const trackers = [];
  const skills = flag(actor, "operatorSkills");
  if (skills?.maximum > 0 && !skills.enabled) trackers.push({ key: "operatorSkills", label: "Operator Skill Points", value: Number(skills.points) || 0,
    maximum: skills.maximum, active: skills.active?.name });
  const dying = flag(actor, "dying");
  if (dying?.active) {
    const value = Math.max(0, Number(dying.mettle) || 0);
    // Preserve manually recorded exceptional excess; displaying or spending
    // Mettle must not silently discard a benefit granted by another feature.
    trackers.push({ key: "dying", label: "Mettle", value, maximum: Math.max(6, value) });
  }
  return trackers;
}

export async function adjustCharacterResource(actor, key, delta) {
  if (actor?.type !== "character" || !actor.isOwner) throw new Error("Select a character you own.");
  if (!Number.isInteger(delta)) throw new Error("Change the resource by a whole number.");
  const tracker = characterResourceTrackers(actor).find(t => t.key === key);
  if (!tracker) throw new Error("This resource is no longer active or configured.");
  if (key === "operatorSkills") return game.ak5e.adjustSkillPoints(actor, delta);
  return actor.update({ "flags.ak5e.dying.mettle": Math.min(tracker.maximum, Math.max(0, tracker.value + delta)) });
}

// DialogV2.wait resolves before the outgoing dialog's closing animation. Wait
// for close before starting another step, as the origin wizard does.
async function trackerDialog(options) {
  let closed;
  const render = options.render;
  const result = await foundry.applications.api.DialogV2.wait({ ...options, render: (event, dialog) => {
    closed = new Promise(resolve => dialog.addEventListener("close", resolve, { once: true }));
    render?.(event, dialog);
  } });
  if (closed) await closed;
  return result;
}

async function recordDialog(actor, tracker) {
  const relationship = flag(tracker.item, "featureTracking")?.relationship;
  const isRelationship = tracker.record.fields.some(f => f.key === "role");
  const targets = tagActors().filter(target => target.isOwner && target.uuid !== actor.uuid);
  const linkedTarget = isRelationship ? `<label>${localize("LinkedCreature")}<select name="targetUuid"><option value="">${localize("RecordOnly")}</option>${targets.map(target => `<option value="${esc(target.uuid)}"${relationship?.partnerUuid === target.uuid ? " selected" : ""}>${esc(target.name)}</option>`).join("")}</select></label><p>${localize("LinkedHint")}</p>` : "";
  const content = `<p>${esc(tracker.record.hint)}</p>${linkedTarget}${tracker.record.fields.map(field => {
    const value = tracker.values[field.key] ?? "";
    const maximum = field.maximum?.(actor);
    const input = field.type === "select"
      ? `<select name="${field.key}"><option value=""></option>${field.options.map(option => `<option${value === option ? " selected" : ""}>${esc(option)}</option>`).join("")}</select>`
      : field.type.endsWith("list") ? `<textarea name="${field.key}" rows="4">${esc(value)}</textarea>` : `<input name="${field.key}" value="${esc(value)}" maxlength="2000">`;
    return `<label>${esc(field.label)}${maximum === undefined ? "" : ` (maximum ${maximum})`}${input}</label>`;
  }).join("")}`;
  const buttons = [{ action: "save", label: localize("Save"), default: true, callback: async (_event, button) => {
    await saveFeatureRecord(actor, tracker.item.id, Object.fromEntries(new FormData(button.form)));
    return true;
  } }];
  if (isRelationship && (relationship || tracker.values.role)) buttons.push({ action: "end", label: localize("EndRelationship"), callback: async () => {
    await saveFeatureRecord(actor, tracker.item.id, { role: "", creature: "", skill: "", targetUuid: "" });
    return true;
  } });
  const result = await trackerDialog({ window: { title: tracker.label }, content: `<div class="ak5e-tracker-dialog">${content}</div>`, rejectClose: false,
    buttons });
  return result;
}

export async function openFeatureCounterSetup(actor) {
  if (actor?.type !== "character" || !actor.isOwner) throw new Error("Select a character you own.");
  const features = entries(actor.items).filter(isAk5eFeature);
  if (!features.length) return;
  const selected = await trackerDialog({ window: { title: localize("Configure") }, rejectClose: false,
    content: `<p>${localize("ConfigureHint")}</p><label>${localize("Feature")}<select name="feature">${features.map(i => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join("")}</select></label>`,
    buttons: [{ action: "next", label: localize("Next"), default: true, callback: (_event, button) => button.form.elements.feature.value }] });
  if (!selected) return;
  const item = actor.items.get(selected);
  assertOwner(actor, item);
  const existing = featureTrackers(actor).find(t => t.item === item && t.key === "uses");
  const recovery = item.system?.uses?.recovery?.[0]?.period ?? existing?.recovery ?? "";
  const label = flag(item, "featureTracking")?.label ?? existing?.label ?? item.name;
  const content = `<p>${localize("ConfigureHint")}</p><p>${esc(featureSource(item)?.sourceHeading ?? item.name)}</p>
    <button type="button" class="ak5e-tracker-rules">${localize("Rules")}</button>
    <label>${localize("Label")}<input name="label" value="${esc(label)}" maxlength="120" required></label>
    <label>${localize("Remaining")}<input name="value" type="number" min="0" step="1" value="${existing?.value ?? 0}" required></label>
    <label>${localize("Maximum")}<input name="maximum" type="number" min="0" step="1" value="${existing?.maximum ?? 0}" required></label>
    <label>${localize("Recovery")}<select name="recovery">${[["", "Manual"], ["sr", "ShortRest"], ["lr", "LongRest"]].map(([key, label]) => `<option value="${key}"${recovery === key ? " selected" : ""}>${localize(label)}</option>`).join("")}</select></label>`;
  return trackerDialog({ window: { title: item.name }, content: `<div class="ak5e-tracker-dialog">${content}</div>`, rejectClose: false,
    render: (_event, dialog) => dialog.element.querySelector(".ak5e-tracker-rules")?.addEventListener("click", event => { event.preventDefault(); item.sheet.render(true); }),
    buttons: [{ action: "save", label: localize("Save"), default: true, callback: async (_event, button) => {
      await configureFeatureCounter(actor, item.id, Object.fromEntries(new FormData(button.form)));
      return true;
    } }] });
}

function actionButton(label, fn) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); safely(Promise.resolve().then(fn)); });
  return button;
}

export function renderFeatureTrackers(app, element) {
  const actor = app?.document?.documentName === "Actor" ? app.document : app?.actor;
  if (!(app instanceof foundry.applications.sheets.ActorSheetV2) || actor?.type !== "character" || !element?.querySelector) return;
  const details = element.matches?.('.tab[data-tab="details"]') ? element : element.querySelector('.tab[data-tab="details"]');
  if (!details) return;
  for (const old of details.querySelectorAll(".ak5e-feature-trackers")) old.remove();
  const target = details.querySelector(":scope > .right");
  if (!target) return;
  const trackers = featureTrackers(actor);
  const characterTrackers = characterResourceTrackers(actor);
  const hasFeatures = entries(actor.items).some(isAk5eFeature);
  if (!trackers.length && !characterTrackers.length && !hasFeatures) return;
  const section = document.createElement("section");
  section.className = "ak5e-feature-trackers";
  const heading = document.createElement("h3");
  heading.textContent = localize("Title");
  section.append(heading);
  const notice = document.createElement("p");
  notice.className = "ak5e-tracker-notice";
  notice.textContent = localize("ManualHint");
  section.append(notice);
  for (const tracker of characterTrackers) {
    const row = document.createElement("div");
    row.className = "ak5e-feature-tracker";
    const label = document.createElement("span");
    label.className = "ak5e-tracker-name";
    label.textContent = `${tracker.label}: ${tracker.value} / ${tracker.maximum}${tracker.active ? ` · ${tracker.active}` : ""}`;
    row.append(label);
    if (actor.isOwner) {
      for (const delta of [-1, 1]) {
        const button = actionButton(delta === -1 ? "−" : "+", async () => {
          const key = `${actor.uuid}.${tracker.key}`;
          if (busy.has(key)) return;
          busy.add(key);
          try { await adjustCharacterResource(actor, tracker.key, delta); }
          finally { busy.delete(key); }
        });
        button.disabled = Boolean(tracker.active);
        button.setAttribute("aria-label", `${localize(delta === -1 ? "Spend" : "Restore")} ${tracker.label}`);
        row.append(button);
      }
    }
    section.append(row);
  }
  for (const tracker of trackers) {
    const row = document.createElement("div");
    row.className = "ak5e-feature-tracker";
    const name = document.createElement("span");
    name.className = "ak5e-tracker-name";
    name.textContent = tracker.key === "uses" ? flag(tracker.item, "featureTracking")?.label ?? tracker.label : tracker.label;
    row.append(name);
    if (tracker.record) {
      const summary = document.createElement("span");
      summary.className = "ak5e-tracker-summary";
      summary.textContent = Object.values(tracker.values).filter(Boolean).join(" · ") || localize("Unselected");
      row.append(summary);
      if (actor.isOwner) row.append(actionButton(localize("Edit"), () => recordDialog(actor, tracker)));
    } else {
      const value = document.createElement("span");
      value.textContent = `${tracker.value} / ${tracker.maximum}`;
      value.title = tracker.recovery === "sr" ? localize("ShortRest") : tracker.recovery === "lr" ? localize("LongRest") : localize("Manual");
      row.append(value);
      if (actor.isOwner) {
        const change = delta => async () => {
          const key = `${actor.uuid}.${tracker.item.id}.${tracker.key}`;
          if (busy.has(key)) return;
          busy.add(key);
          try {
            const current = featureTrackers(actor).find(t => t.item.id === tracker.item.id && t.key === tracker.key);
            if (current) await setFeatureCounter(actor, current.item.id, current.key, Math.min(current.maximum, Math.max(0, current.value + delta)));
          } finally { busy.delete(key); }
        };
        const spend = actionButton("−", change(-1));
        spend.setAttribute("aria-label", `${localize("Spend")} ${tracker.label}`);
        const restore = actionButton("+", change(1));
        restore.setAttribute("aria-label", `${localize("Restore")} ${tracker.label}`);
        row.append(spend, restore);
      }
    }
    row.append(actionButton(localize("Rules"), () => tracker.item.sheet.render(true)));
    section.append(row);
  }
  if (actor.isOwner && hasFeatures) section.append(actionButton(localize("Configure"), () => openFeatureCounterSetup(actor)));
  if (actor.isOwner && hasFeatures) section.append(actionButton(game.i18n.localize("AK5E.Tags.Add"), () => openFeatureTagSetup(actor)));
  target.append(section);
}

export function registerFeatureTrackerHooks() {
  Hooks.on("renderActorSheetV2", renderFeatureTrackers);
  Hooks.on("dnd5e.restCompleted", (actor, result, config) => { safely(recoverFeatureTrackers(actor, result, config)); });
  registerFeatureTagHooks();
}
