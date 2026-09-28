import { CHAPTER_TWO_ORIGINS as ORIGINS } from "./chapter-two-content.mjs";
import { CHAPTER_THREE_CLASSES as CLASSES } from "./chapter-three-content.mjs";
import { CHAPTER_FOUR_EQUIPMENT as EQUIPMENT } from "./chapter-four-content.mjs";
import { nativeOriginUses, registerFeatureTrackerHooks } from "./feature-trackers.mjs";

// Only AK5e-tagged origin Items opt into this workflow. No stock advancement patching.
const VERSION = 1;
const active = new Set();
const applying = new Set();
const slug = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export const LANGUAGES = ["Aegirian", "Durinese", "Higashinese", "Iberian", "Kazimierzian", "Kjeragian", "Lateran", "Leithanian", "Samifjod", "Sargonic", "Sarkazian", "Siracusan", "Ursine", "Victorian", "Yanese"];
export const INSTRUMENTS = ["Bagpipes", "Bass", "Cello", "Drums", "Flute", "Guitar", "Keyboard", "Lyre", "Microphone", "Trombone", "Tuba", "Turntable", "Violin"];
export const TOOLS = ["Art Kit", "Brewing Kit", "Cooking Kit", "Engineering Kit", "Maintenance Kit", "Makeover Kit", "Mechanism Kit", "Medical Kit", "Messenger Kit", "Pharmacology Kit", "Tailoring Kit", "Woodwork Kit", ...INSTRUMENTS, "Land Vehicles", "Vehicles (Drones)"];
export const SKILLS = { Acrobatics: "acr", "Animal Handling": "ani", Arts: "arc", Athletics: "ath", Deception: "dec", Insight: "ins", Intimidation: "itm", Investigation: "inv", Lore: "ak5elore", Medicine: "med", Perception: "prc", Performance: "prf", Persuasion: "per", "Sleight of Hand": "slt", Stealth: "ste", Technology: "ak5etech", Wilderness: "ak5ewilderness" };
const BASIC_TACTICS = ["Charge", "Fall Back", "Move Up", "Pincer Manoeuvre", "Switch Ranks", "To My Side"];
export const TACTICS = CLASSES.filter(e => e.parentBranch === "Tactician" && BASIC_TACTICS.includes(e.sourceHeading.replace(/ \(.*$/, "")));
const CASTER_TACTICS = CLASSES.find(e => e.parentBranch === "Tactician" && e.sourceHeading === "Tactics for Casters").content;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const flag = (doc, key) => doc?.getFlag?.("ak5e", key) ?? doc?.flags?.ak5e?.[key];
const toolKey = name => `ak5e${slug(name)}`;
const skillName = name => name === "Tech" ? "Technology" : name;
const entries = collection => Array.from(collection?.values?.() ?? collection ?? []);
const sourceSystem = actor => actor._source?.system ?? actor.system;

export function registerOriginConfig() {
  const config = CONFIG.DND5E;
  if (!config) return;
  for (const name of TOOLS) {
    config.tools[toolKey(name)] = { label: name, ability: INSTRUMENTS.includes(name) ? "cha" : "int" };
    // D&D5e's sheet resolves labels through toolProficiencies before trying a
    // base-item compendium lookup. These custom tools have no compendium IDs.
    config.toolProficiencies[toolKey(name)] = name;
  }
  // Add namespaced skills; do not rename or delete the system's existing skills.
  for (const [key, label, ability] of [["ak5elore", "Lore (AK5e)", "int"], ["ak5etech", "Technology (AK5e)", "int"], ["ak5ewilderness", "Wilderness (AK5e)", "wis"]]) {
    config.skills[key] = { label, ability, fullKey: key };
  }
}

export function getOriginEntry(item) {
  const id = flag(item, "chapterTwoId");
  return ORIGINS.find(e => e.id === id && ["background", "nationality", "species"].includes(e.kind));
}

function choice(key, label, options, count = 1) { return { key, label, options, count }; }

/** Build a source-backed setup plan without changing any documents. */
export function buildOriginPlan(entry, actor) {
  const plan = { entry, choices: [], tools: [], languages: [], skills: [], equipment: [], weapons: [], features: [], manual: [] };
  const raw = entry.rawSource;
  if (entry.kind === "background") {
    const prof = raw.match(/\*\*\*Proficiencies:\*\*\*([^\n]+)/)?.[1] ?? "";
    const first = prof.split(/, and one other|\. In addition/)[0];
    const options = TOOLS.filter(t => first.includes(t));
    if (/an Instrument/.test(first)) options.push(...INSTRUMENTS.filter(t => !options.includes(t)));
    if (options.length === 1) plan.tools.push(options[0]);
    else if (options.length > 1) {
      if (entry.name === "Ursus Army Veteran") plan.tools.push(...options);
      else plan.choices.push(choice("primaryTool", "Choose your background tool or instrument", options));
    }
    const freeCount = /two Tools\/Vehicles/.test(prof) ? 2 : /one other Tool\/Vehicle|one Tool\/Vehicle/.test(prof) ? 1 : 0;
    if (freeCount) plan.choices.push(choice("tools", `Choose ${freeCount} ${freeCount === 1 ? "other proficiency" : "tool/vehicle proficiencies"}`, TOOLS.filter(t => !plan.tools.includes(t)), freeCount));
    if (entry.name === "Upper Class") plan.choices.push(choice("languages", "Choose a language", LANGUAGES));
    const featName = raw.match(/\*\*\*Background Feat \(([^\n]+?)\):\*\*\*/)?.[1];
    if (!featName) throw new Error(`No background feature found for ${entry.name}.`);
    // Retain the published rules, including exceptions; the extra card is a navigable feature.
    plan.features.push({ name: featName, content: entry.content });
    if (entry.name === "Military School Graduate") {
      plan.choices.push(choice("tactics", "Choose two Basic Tactics", TACTICS.map(t => t.name), 2));
      plan.manual.push("Officer's Acumen tracker recovers on a D&D5e Long Rest. Spend Acumen manually when using a tactic. If you take the Tactician Branch, combine this +3 with its pool; do not use two independent pools.");
    }
    if (entry.name === "Professional") {
      plan.choices.push(choice("skills", "Choose two skill proficiencies", Object.keys(SKILLS), 2));
      plan.choices.push(choice("expertise", "Choose expertise (an existing proficiency or one selected above)", Object.keys(SKILLS)));
    }
    if (entry.name === "Ægir Sage") plan.skills.push("Technology");
    const equipmentChoices = {
      "Knight of Kazimierz": ["Spear", "Polearm"], Miner: ["Greataxe", "Heavy Hammer"],
      "Ursus Army Veteran": ["Combat Gear", "Polearm", "Crossbow"],
      Soldier: EQUIPMENT.filter(e => e.kind === "weapon" && /^(Light|Heavy) (Melee|Ranged) Weapons$/.test(e.tableData?.category) && !e.tableData.properties.includes("Firearm")).map(e => e.name)
    }[entry.name];
    if (equipmentChoices) plan.choices.push(choice("equipment", "Choose starting equipment", equipmentChoices));
    if (["Knight of Kazimierz", "Miner"].includes(entry.name)) plan.weapons.push(...equipmentChoices);
    if (entry.name === "Inquisitor") {
      plan.weapons.push("Sword");
      plan.equipment.push("Sword", "Lantern of the Iberian Inquisition");
      plan.manual.push("Lantern aura, Seaborn disadvantage, and AK5e weapon properties are rules reminders, not automatic roll modifiers.");
    }
    if (entry.name === "Pathfinder") {
      plan.manual.push("Find the Path replaces normal skill proficiency with Proficiency Points. Allocate and track these with your GM: 3 at level 1, +1 each later level; maximum per skill is level +3. Species/nationality proficiencies are lost, and later proficiency/expertise grants convert to 1/3 points. This conversion is NOT automated; record your allocation below. Do not also apply normal proficiency bonuses.");
    }
    if (entry.parent) plan.manual.push(`This unique background is normally available to characters from ${entry.parent}. Confirm eligibility with your GM.`);
  } else if (entry.kind === "nationality") {
    // Exclude the nationality's unique background: it is a separate selection, not a grant.
    const own = raw.split(/##### Unique Background/)[0];
    const languageText = own.match(/\*\*\*Languages:\*\*\*([^\n]+)/)?.[1] ?? "";
    plan.languages = languageText.split("+").map(s => s.trim().replace(/\.$/, "")).filter(s => !/\d/.test(s)).map(s => s === "Lethanian" ? "Leithanian" : s);
    const languageCount = Number(languageText.match(/(\d) (?:other )?Languages?/i)?.[1] ?? 0);
    if (languageCount) plan.choices.push(choice("languages", "Choose additional languages", LANGUAGES.filter(l => !plan.languages.includes(l)), languageCount));
    const block = own.match(/\*\*\*Proficiencies:\*\*\*[^\n]*\n((?:- [^\n]+\n)+)/)?.[1];
    if (block) plan.choices.push(choice("skills", "Choose three nationality skills", block.trim().split("\n").map(s => skillName(s.slice(2).trim())), 3));
    if (entry.name === "Kjerag") plan.skills.push("Lore");
    if (entry.name === "Leithanien") {
      plan.skills.push("Performance");
      plan.choices.push(choice("instrument", "Choose your proficient starting instrument", INSTRUMENTS));
    }
    plan.manual.push("The nationality feature is retained on this Item. Conditional bonuses and GM-mediated benefits are not automatic. Your unique background must be selected separately.");
  } else {
    const parent = entry.parent ? ORIGINS.find(e => e.kind === "species" && e.name === entry.parent) : null;
    plan.features = ORIGINS.filter(e => e.kind === "species-feature" && [entry.name, parent?.name].includes(e.parent)).map(e => ({ name: e.name, content: e.content, sourceId: e.id, sourceHeading: e.sourceHeading }));
    plan.manual.push("Species setup currently adds the feature cards for review, including parent-species features for a subspecies. Ability increases, size variants, Ancient Versatility, Arts selections and other species choices must still be resolved with the GM and recorded below. This is not a completed species-stat builder.");
  }
  plan.manual.push("Conditional advantages, extra damage, story benefits, and future-level changes are preserved as rules text unless explicitly listed in the review as applied. Tool proficiency does not grant ownership of a toolkit.");
  return plan;
}

export function validateOriginChoices(plan, values, actor) {
  for (const field of plan.choices) {
    const selected = values[field.key] ?? [];
    if (selected.length !== field.count || new Set(selected).size !== selected.length || selected.some(v => !field.options.includes(v))) {
      throw new Error(`${field.label}: select exactly ${field.count}.`);
    }
  }
  const tools = [...plan.tools, ...(values.primaryTool ?? []), ...(values.tools ?? [])];
  if (new Set(tools).size !== tools.length) throw new Error("Choose different tool/vehicle proficiencies.");
  if (values.expertise?.length) {
    const name = values.expertise[0];
    if (!(values.skills ?? []).includes(name) && (actor.system.skills?.[SKILLS[name]]?.value ?? 0) < 1) {
      throw new Error("Expertise must be in a skill you are proficient in, including either skill selected above.");
    }
  }
  if (plan.entry.name === "Pathfinder" && !values.notes?.trim()) throw new Error("Record your Proficiency Point allocation and GM follow-up before continuing.");
  if (entries(actor.items).some(i => getOriginEntry(i)?.name === "Pathfinder") && ((values.skills?.length ?? 0) || plan.skills.length)) {
    throw new Error("This character has Pathfinder. Its proficiency-point conversion needs GM review; normal skill grants cannot be applied by this menu.");
  }
}

function customTrait(actor, field, additions) {
  return [...new Set([...(sourceSystem(actor).traits?.[field]?.custom ?? "").split(";").map(s => s.trim()).filter(Boolean), ...additions])].join("; ");
}

export function prepareOriginChanges(plan, values, actor, item) {
  validateOriginChoices(plan, values, actor);
  const update = {};
  const grants = [];
  const summary = [];
  const tools = [...plan.tools, ...(values.primaryTool ?? []), ...(values.tools ?? []), ...(values.instrument ?? [])];
  for (const name of tools) {
    const key = toolKey(name);
    update[`system.tools.${key}.value`] = Math.max(1, sourceSystem(actor).tools?.[key]?.value ?? 0);
    if (!sourceSystem(actor).tools?.[key]) update[`system.tools.${key}.ability`] = INSTRUMENTS.includes(name) ? "cha" : "int";
    summary.push(`Tool proficiency: ${name}`);
  }
  for (const name of [...plan.skills, ...(values.skills ?? []), ...(values.expertise ?? [])]) {
    const key = SKILLS[name];
    if (!key) throw new Error(`Unsupported skill: ${name}`);
    update[`system.skills.${key}.value`] = Math.max((values.expertise ?? []).includes(name) ? 2 : 1, sourceSystem(actor).skills?.[key]?.value ?? 0);
    summary.push(`${(values.expertise ?? []).includes(name) ? "Expertise" : "Skill proficiency"}: ${name}`);
  }
  const languages = [...plan.languages, ...(values.languages ?? [])];
  if (languages.length) {
    update["system.traits.languages.custom"] = customTrait(actor, "languages", languages);
    summary.push(`Languages: ${languages.join(", ")}`);
  }
  const weapons = [...plan.weapons, ...(["Soldier", "Ursus Army Veteran"].includes(plan.entry.name) ? values.equipment ?? [] : [])];
  if (weapons.length) {
    const armour = weapons.filter(w => w === "Combat Gear");
    const weapon = weapons.filter(w => w !== "Combat Gear");
    if (weapon.length) update["system.traits.weaponProf.custom"] = customTrait(actor, "weaponProf", weapon);
    if (armour.length) update["system.traits.armorProf.custom"] = customTrait(actor, "armorProf", armour);
    summary.push(`Specific equipment proficiency: ${weapons.join(", ")} (not the whole D&D5e weapon/armour category)`);
  }
  const makeFeat = (name, content, system = {}) => ({ name, type: "feat", img: "icons/svg/book.svg", system: { advancement: [], description: { value: content }, ...system } });
  for (const feat of plan.features) {
    const uses = nativeOriginUses(feat.sourceId);
    grants.push(makeFeat(feat.name, feat.content, uses ? { uses } : {}));
  }
  const resource = {
    "Military School Graduate": ["Acumen (Officer)", "3", "lr"], Samurai: ["Pride", "2", "lr"],
    "Pontifica Cohors Lateran": ["Legion of Heaven", "1", "sr"], "Taran Nationalist": ["Great Flame of Tara", "1", "lr"],
    "Martial Arts Practitioner": ["Wuxia", "@prof", "lr"], Entertainer: ["Finger on the Pulse", "1", "lr"],
    "Ægir Sage": ["Legacy of the Predecessors", "1", "sr"]
  }[plan.entry.name];
  const alreadyTactician = plan.entry.name === "Military School Graduate" && entries(actor.items).some(i => i.type === "subclass" && (i.system?.identifier === "tactician" || i.name === "Tactician" || flag(i, "parentBranch") === "Tactician"));
  if (alreadyTactician) summary.push("Officer: increase your existing Tactician Acumen maximum by 3 with the GM. No separate pool is created.");
  if (resource && !alreadyTactician) {
    const [label, max, period] = resource;
    const feat = grants[0];
    feat.name = `${feat.name} — ${label}`;
    feat.system.uses = { spent: 0, max, recovery: [{ period, type: "recoverAll" }] };
    summary.push(`${label}: ${max} uses, restored on ${period === "lr" ? "Long" : "Short/Long"} Rest. Expenditure and conditional effects are manual.`);
  }
  for (const name of values.tactics ?? []) {
    const tactic = TACTICS.find(t => t.name === name);
    grants.push(makeFeat(tactic.name, `<p>Use as an Action or Bonus Action; expend the indicated Acumen from your Acumen pool. Each tactic can be used once before the start of your next turn. Beneficiaries must clearly hear or see you. Resolve movement and attacks manually.</p>${tactic.content}${CASTER_TACTICS}`));
  }
  for (const name of [...plan.equipment, ...(values.equipment ?? []), ...(values.instrument ?? [])]) {
    const lantern = name === "Lantern of the Iberian Inquisition";
    const instrument = INSTRUMENTS.includes(name);
    const e = EQUIPMENT.find(e => e.name === (lantern ? "Arts Wand" : instrument ? "Instrument (X)" : name) && ["weapon", "equipment", "instrument", "tool"].includes(e.kind));
    if (!e) throw new Error(`Starting equipment data unavailable: ${name}. Nothing has been applied.`);
    const data = { name, type: e.itemType, img: "icons/svg/item-bag.svg", system: { ...structuredClone(e.systemData), description: { value: e.content }, quantity: 1 } };
    if (weapons.includes(name)) data.system.proficient = 1;
    if (instrument) {
      const weights = [6, 8, 7, 15, 1, 6, 20, 3, 1, 4, 20, 10, 3];
      data.system.weight = { value: weights[INSTRUMENTS.indexOf(name)], units: "lb" };
      data.system.type = { value: "music", baseItem: toolKey(name) };
    }
    if (lantern) data.system.description.value = `${e.content.replace("Casting Unit, ", "")}<p>This lantern does not have the Casting Unit Property.</p>${plan.entry.content}`;
    grants.push(data);
  }
  // Native, removable effects avoid permanently adding the same numerical bonus twice.
  if (plan.entry.name === "Labourer") grants[0].effects = [{ name: "Breaking Common Ground: +1 HP per level", transfer: true, changes: [{ key: "system.attributes.hp.bonuses.level", mode: 2, value: "1" }] }];
  if (plan.entry.name === "Miner") grants[0].effects = [{ name: "Groundbreaker: +10 ft. Blindsight", transfer: true, changes: [{ key: "system.attributes.senses.ranges.blindsight", mode: 2, value: "10" }] }];
  if (plan.entry.name === "Labourer") summary.push("Maximum HP bonus: +1 per character level (transfer effect).");
  if (plan.entry.name === "Miner") summary.push("Blindsight: +10 feet (transfer effect).");
  for (const [index, data] of grants.entries()) {
    const feature = plan.features[index];
    data.flags = { ak5e: { originGrant: { originId: plan.entry.id, itemId: item.id, index },
      sourceHeading: feature?.sourceHeading ?? plan.entry.sourceHeading,
      ...(feature?.sourceId ? { chapterTwoId: feature.sourceId } : {}) } };
    summary.push(`Add ${data.type === "feat" ? "feature" : "equipment"}: ${data.name}`);
  }
  return { update, grants, summary };
}

function assertOwner(actor, item) {
  if (actor?.type !== "character" || !actor.isOwner || item?.parent !== actor || !actor.items.get(item.id)) throw new Error("Open setup on an AK5e origin belonging to a character you own.");
}

/** Idempotent per actor/origin, including deleted-and-redropped background Items. */
export async function applyOriginSetup(actor, item, values) {
  assertOwner(actor, item);
  const entry = getOriginEntry(item);
  if (!entry) throw new Error("This is not an AK5e origin Item.");
  const receipt = flag(actor, "originSetups")?.[entry.id];
  if (receipt) throw new Error("This origin already has a setup record. Review it from AK5e Origins; do not apply the benefits twice.");
  if (applying.has(actor.uuid)) throw new Error("Another origin is being applied to this character. Please wait.");
  const changes = prepareOriginChanges(buildOriginPlan(entry, actor), values, actor, item);
  applying.add(actor.uuid);
  try {
    // A recovery journal is written first. If a later operation fails, rerunning cannot double-grant.
    const state = { version: VERSION, status: "applying", itemId: item.id, choices: structuredClone(values), summary: changes.summary, manual: buildOriginPlan(entry, actor).manual };
    await actor.update({ [`flags.ak5e.originSetups.${entry.id}`]: state });
    if (changes.grants.length) await actor.createEmbeddedDocuments("Item", changes.grants, { ak5eOriginSetup: true });
    await actor.update({ ...changes.update, [`flags.ak5e.originSetups.${entry.id}.status`]: "complete" });
    ui.notifications.info(`AK5e: ${entry.name} setup applied.`);
    return changes;
  } catch (error) {
    ui.notifications.error(`AK5e setup stopped: ${error.message} Open AK5e Origins to review the saved record before retrying.`);
    throw error;
  } finally { applying.delete(actor.uuid); }
}

function renderChoices(plan, values) {
  return plan.choices.map(field => `<fieldset><legend>${esc(field.label)} — ${field.count} required</legend><div class="ak5e-origin-options">${field.options.map(option => `<div><label><input type="checkbox" name="${esc(field.key)}" value="${esc(option)}" ${(values[field.key] ?? []).includes(option) ? "checked" : ""}> ${esc(option)}</label>${field.key === "tactics" ? `<details><summary>Read tactic</summary>${TACTICS.find(t => t.name === option).content}</details>` : ""}</div>`).join("")}</div></fieldset>`).join("") + `<label>Character choices / GM notes ${plan.entry.name === "Pathfinder" ? "(required point allocation)" : "(optional)"}<textarea name="notes" rows="3">${esc(values.notes ?? "")}</textarea></label>`;
}

async function page(title, content, buttons) {
  // DialogV2.wait resolves on submit, before the outgoing window's close animation.
  // Wait for close as well so Back/Next never briefly stack two interactive steps.
  let closed = Promise.resolve();
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title }, position: { width: 680 }, classes: ["ak5e-origin-dialog"],
    content: `<section class="ak5e-origin-content">${content}</section>`, buttons, rejectClose: false,
    render: (_event, dialog) => { closed = new Promise(resolve => dialog.addEventListener("close", resolve, { once: true })); }
  });
  await closed;
  return result;
}

export async function openOriginSetup(actor, item) {
  assertOwner(actor, item);
  const entry = getOriginEntry(item);
  if (!entry) throw new Error("Select an AK5e background, nationality or species.");
  if (active.has(actor.uuid)) return;
  active.add(actor.uuid);
  try {
    const receipt = flag(actor, "originSetups")?.[entry.id];
    if (receipt) {
      await page(`AK5e — ${entry.name}`, `<h2>Setup ${receipt.status === "complete" ? "record" : "needs GM recovery"}</h2><p>${receipt.status === "complete" ? "These benefits were already applied. Reopening or dropping the origin again will not duplicate them." : "An earlier application stopped part-way. A GM must reconcile the saved changes and tagged feature Items before clearing this origin's setup record. No benefits will be applied again automatically."}</p><ul>${receipt.summary.map(s => `<li>${esc(s)}</li>`).join("")}</ul><pre>${esc(JSON.stringify(receipt.choices, null, 2))}</pre>`, [{ action: "close", label: "Close" }]);
      return;
    }
    const plan = buildOriginPlan(entry, actor);
    let values = structuredClone(flag(actor, "originDrafts")?.[entry.id] ?? {});
    let step = 0;
    while (true) {
      const featurePages = [...(plan.features.length ? plan.features : [{ name: entry.name, content: entry.content.split(/<h5>Unique Background/)[0] }]), ...TACTICS.filter(t => values.tactics?.includes(t.name))];
      const total = featurePages.length + 2;
      let content;
      if (step === 0) content = `<h2>${esc(entry.name)}: choices</h2><p>The origin is attached, but setup benefits are not applied until you press Apply. Closing leaves it available to resume from the character sheet’s AK5e Origins button.</p>${renderChoices(plan, values)}<ul>${plan.manual.map(s => `<li>${esc(s)}</li>`).join("")}</ul>`;
      else if (step === total - 1) {
        const changes = prepareOriginChanges(plan, values, actor, item);
        content = `<h2>Review and apply</h2><ul>${changes.summary.map(s => `<li>${esc(s)}</li>`).join("")}</ul><h3>Rules to resolve during play / with your GM</h3><ul>${plan.manual.map(s => `<li>${esc(s)}</li>`).join("")}</ul><p>Recorded notes: ${esc(values.notes || "None")}</p>`;
      } else content = `<h2>Feature ${step} of ${featurePages.length}: ${esc(featurePages[step - 1].name)}</h2>${featurePages[step - 1].content}`;
      const buttons = [{ action: "cancel", label: "Finish later" }];
      if (step > 0) buttons.push({ action: "back", label: "Back" });
      buttons.push({ action: "next", label: step === total - 1 ? "Apply to character" : "Next", default: true, callback: (_event, button) => {
        if (step === 0) {
          const form = new FormData(button.form);
          values = Object.fromEntries(plan.choices.map(f => [f.key, form.getAll(f.key)]));
          values.notes = String(form.get("notes") ?? "");
        }
        return "next";
      } });
      const result = await page(`AK5e Origin Setup — ${step + 1} of ${total}`, content, buttons);
      if (!result || result === "cancel") return;
      if (result === "back") { step--; continue; }
      try { validateOriginChoices(plan, values, actor); }
      catch (error) { ui.notifications.warn(error.message); continue; }
      if (step === 0) await actor.update({ [`flags.ak5e.originDrafts.${entry.id}`]: values });
      if (step === total - 1) { await applyOriginSetup(actor, item, values); return; }
      step++;
    }
  } finally { active.delete(actor.uuid); }
}

export async function openActorOrigins(actor) {
  if (!actor?.isOwner || actor.type !== "character") throw new Error("Select a character you own.");
  const origins = entries(actor.items).filter(getOriginEntry);
  if (!origins.length) { ui.notifications.info("Drag an AK5e background, nationality or species onto this character first."); return; }
  const selected = await page("AK5e Origins", `<p>Select an attached origin to set it up or review its saved choices.</p><label>Origin<select name="origin">${origins.map(i => `<option value="${esc(i.id)}">${esc(i.name)} — ${flag(actor, "originSetups")?.[getOriginEntry(i).id]?.status ?? "setup pending"}</option>`).join("")}</select></label>`, [{ action: "open", label: "Open setup", default: true, callback: (_event, button) => button.form.elements.origin.value }]);
  if (selected) return openOriginSetup(actor, actor.items.get(selected));
}

export function registerOriginHooks() {
  const safely = promise => promise.catch(error => { console.error("AK5e | Origin setup", error); ui.notifications.error(error.message); });
  const actorFor = app => app?.document?.documentName === "Actor" ? app.document : app?.actor?.documentName === "Actor" ? app.actor : null;
  const canOpen = actor => actor?.type === "character" && actor.isOwner && entries(actor.items).some(getOriginEntry);
  Hooks.on("createItem", (item, options, userId) => {
    if (options.ak5eOriginSetup || userId !== game.user.id || !getOriginEntry(item) || item.parent?.type !== "character" || !item.parent.isOwner) return;
    // Do not return a Promise from a document lifecycle hook.
    safely(openOriginSetup(item.parent, item));
  });
  // Window controls belong to the outer ApplicationV2 frame. This is the
  // supported way to add an entry to the sheet's top-right three-dot menu.
  Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
    const actor = actorFor(app);
    if (!(app instanceof foundry.applications.sheets.ActorSheetV2) || !canOpen(actor) ||
        controls.some(control => control.action === "ak5eOrigins")) return;
    controls.unshift({
      action: "ak5eOrigins",
      icon: "fa-solid fa-compass",
      label: "AK5e Origins",
      ownership: "OWNER",
      onClick: () => safely(openActorOrigins(actor))
    });
  });
  Hooks.on("renderActorSheetV2", renderOriginControls);
  registerFeatureTrackerHooks();
}

/** Origins belong beside species/background in D&D5e's Details part. */
export function renderOriginControls(app, element) {
  const actor = app?.document?.documentName === "Actor" ? app.document : app?.actor;
  if (!(app instanceof foundry.applications.sheets.ActorSheetV2) || actor?.type !== "character" || !element?.querySelector) return;
  // Remove the former header shortcut when a full sheet is available.
  for (const old of element.querySelectorAll(".sheet-header .ak5e-origins-button")) old.remove();
  const details = element.matches?.('.tab[data-tab="details"]') ? element : element.querySelector('.tab[data-tab="details"]');
  if (!details) return;
  for (const old of details.querySelectorAll(".ak5e-origins-section")) old.remove();
  const target = details.querySelector(".pills-lg");
  const origins = entries(actor.items).filter(getOriginEntry);
  if (!target || !origins.length) return;
  const section = document.createElement("section");
  section.className = "ak5e-origins-section";
  const title = document.createElement("h3");
  title.textContent = game.i18n.localize("AK5E.Origins.Title");
  section.append(title);
  for (const item of origins) {
    const entry = getOriginEntry(item);
    const row = document.createElement("div");
    row.className = "ak5e-origin-summary";
    const label = document.createElement("span");
    label.textContent = game.i18n.localize(`AK5E.Origins.${entry.kind}`);
    const name = document.createElement("button");
    name.type = "button";
    name.textContent = item.name;
    name.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); item.sheet.render(true); });
    row.append(label, name);
    section.append(row);
  }
  if (actor.isOwner) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ak5e-origins-button";
    button.textContent = game.i18n.localize("AK5E.Origins.Setup");
    button.addEventListener("click", event => {
      event.preventDefault(); event.stopPropagation();
      openActorOrigins(actor).catch(error => { console.error("AK5e | Origin setup", error); ui.notifications.error(error.message); });
    });
    section.append(button);
  }
  target.append(section);
}
