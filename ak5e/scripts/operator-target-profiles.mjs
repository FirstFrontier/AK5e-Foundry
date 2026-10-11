/** Source-reviewed Chapter 3 geometry. Distances are feet; no missing DC/range is inferred. */
export const PROFILE_VERSION = 1;
const direct = (range, extra = {}) => ({ mode: "targets", range, maximum: 1, ...extra });
const area = (shape, distance, extra = {}) => ({ mode: "area", shape, distance, anchor: "source", ...extra });
const placed = (shape, distance, range, extra = {}) => area(shape, distance, { anchor: "placed", range, ...extra });
const targetArea = (distance, range, extra = {}) => area("circle", distance, { mode: "target-area", anchor: "target", range, maximum: 1, ...extra });
// These overrides resolve wording which cannot safely be interpreted by a generic text parser.
const reviewed = {
  "Volcanian": { mode: "self", save: null, damage: null, laterArea: placed("circle", 10, 45, { reposition: true, ownTurn: true, activation: "bonus", save: "dex", dc: "martial", damage: "6d6", damageType: "fire", half: true }) },
  "Counter Arc": { mode: "self", save: null, damage: null, laterArea: area("cone", 10, { activation: "reaction", save: "dex", dc: "martial", damage: "4d6", damageType: "lightning", half: true }) },
  "Destiny": area("rect", 20, { choice: true, manualRoll: true, save: null }),
  "Laser Focus": area("ray", 120, { width: 5, manualRoll: true, save: null }),
  "Flicker": direct(30, { manualRoll: true }), "Heaven Piercer": direct(50, { manualRoll: true }),
  "Parting Shot": direct(30, { manualRoll: true }), "Self-Defence Shock": direct(10),
  "Assault Tactics": placed("circle", 20, 50), "Eternal Hunt": direct(100, { save: null, manualRoll: true }),
  "Deterring Radiance": area("rect", 15, { events: ["target-end"], noInitialRoll: false }),
  "Invariance Principle": area("circle", 10, { moving: true, excludeSource: true, events: ["source-start"], damage: "@abilities.con.mod", damageType: "force", save: null }),
  "Vacuum Assault": area("circle", 30, { disposition: "hostile", when: "optional", save: "str", dc: "martial", damage: null, manualRoll: true, repeat: "special" }),
  "Seal Away": direct(30, { when: "optional", damage: "4d6", damageType: "force", repeat: "special", save: null }),
  "Omen of Defeat": direct(100, { manualRoll: true }),
  "Skydrop": area("circle", 15, { excludeSource: true, manualRoll: true }),
  "Electrowebbing": placed("circle", 10, 30),
  "Levitate": direct(30), "Mark Prey": direct(null), "Lock On": direct(null),
  "Salt in the Wound": direct(100), "Gentle Binding": direct(60),
  "Punishment": direct(60, { manualRoll: true }),
  "Wolfpack": direct(100, { manualRoll: true }), "Emergency Camouflage": direct(15), "Phase Lock": direct(30),
  "Monitoring": direct(null, { maximum: null }), "Torrential Downpour": direct(30, { maximum: 5, choice: true }),
  "Pin Down": direct(60, { maximum: 3 }), "Stormbolt": direct(60), "Last Breath": direct(60),
  "Harpoon Shot": direct(100), "Drag Force": direct(50), "Echoes of Life": direct(100, { healing: "2d8", instances: 5 }),
  "Past Unwritten": direct(100, { maximum: 2 }), "To Take Umbrage": direct(30, { manualRoll: true }),
  "Emergency Aid": direct(60, { manualRoll: true }), "Placebo Effect": targetArea(10, 50, { disposition: "hostile", manualRoll: true }),
  "Death Detonation": targetArea(10, null, { damage: "5d6", damageType: "thunder", anchorCreatureType: "construct" }),
  "Savagery Unrelenting": targetArea(10, null, { disposition: "hostile", damage: "2d8", damageType: "psychic" }),
  "Devastating Blow": targetArea(10, null, { excludeSource: true, manualRoll: true }),
  "Fortcracker": targetArea(10, null, { manualRoll: true }), "Dangerous Operation": targetArea(5, null, { disposition: "hostile", manualRoll: true }),
  "Spreading Chaos": direct(30, { manualRoll: true }), "Ultimatum": direct(60, { manualRoll: true }),
  "Miracle": direct(null, { maximum: 5, manualRoll: true }), "Empathic Obliteration": direct(60, { maximum: 2, manualRoll: true }),
  "Empathic Rejuvenation": direct(15, { manualRoll: true }), "Weaving Through War": area("circle", 30, { disposition: "ally", choice: true, manualRoll: true }),
  "Leafcutter": direct(30, { maximum: 8, weapon: true }), "Flash Lightning": direct(60, { maximum: 5, weapon: true }),
  "Storm": direct(100, { maximum: 3, weapon: true }), "Mob Mauler": direct(null, { weapon: true, disposition: "hostile" }),
  "Wrathful Blow": direct(null, { weapon: true }), "Leading Lance": direct(null, { weapon: true }),
  "Spirit Strikes": direct(null, { weapon: true, repeat: "bonus" }), "Venom Fang": direct(null, { damage: "3d8", damageType: "poison" }),
  "Armourburner": area("cone", 20), "Dragonstrike": area("cone", 20),
  "Wave Strike": area("cone", 30, { damage: "4d6", damageType: "thunder" }), "Line Breaker": area("ray", 50, { width: 5 }),
  "Blade of Light": area("ray", 80, { width: 10 }), "To Part the Seas": area("ray", 100, { width: 5, variable: true }),
  "Sweep Away": area("cone", 30, { angle: 180 }), "Overrun": area("rect", 15),
  "Grand Cross": area("cross", 50, { width: 10, excludeSource: true }),
  "Cluster Bombs": placed("circle", 10, 30, { templates: 3 }),
  "EMP": area("circle", 50, { choice: true }), "Meandering Stars": area("circle", 50, { choice: true, manualRoll: true }),
  "Phantom Force": placed("circle", 20, 100), "Leaping Strike": placed("circle", 15, 60, { excludeSource: true }),
  "When Space Obeys": area("circle", 30, { choice: true }), "Grave Howl": area("circle", 10, { disposition: "hostile" }),
  "Healing Wave": area("rect", 15, { disposition: "hostile", dc: "manual" }),
  "Nature's Blessing": placed("circle", 10, 60, { choice: true }), "Visual Trap": placed("rect", 15, 60),
  "Zero Burst": placed("circle", 10, null), "Glory": area("cone", 60, { repeat: "action" }),
  "Frost Claw": area("ray", 30, { width: 5, repeat: "action" }),
  "Holding Shadow": area("rect", 20, { delayed: "source-start", delayedDamage: "4d6", delayedType: "force" }),
  "Meteoric Descent": placed("circle", 20, 300, { when: "source-start", excludeSource: true }),
  "From On High": area("circle", 25, { excludeSource: true }), "Silence": area("circle", 25, { excludeSource: true, manualRoll: true }),
  "Charge On": area("ray", 30, { width: 10, variable: true }),
  "Breacher Round": area("ray", 60, { width: 5, piercing: true, manualRoll: true }),
  "No Escape": area("ray", null, { width: 5, variable: true, weaponRange: true, weapon: true, sharedAttack: true, piercing: true, repeat: "attack", noInitialRoll: true }),
  "Spinning Edge": placed("circle", 15, null, { weaponRange: true, events: ["entry", "target-start"], manualRoll: true }),
  "Storm's Wake": placed("circle", 15, null, { events: ["entry", "target-start"], manualRoll: true, areaMovement: { when: "source-end", feet: 20, reference: "current" } }),
  "Desolate Echo": placed("circle", 20, null, { disposition: "hostile", events: ["entry"], manualRoll: true }),
  "Truesilver Slash": area("cone", 20, { weapon: true, repeat: "attack" }),
  "Radial Guard": area("circle", 10, { disposition: "ally", excludeSource: true, moving: true }),
  "Amplification Field": area("circle", 15, { moving: true }), "Fortress": area("circle", 30, { disposition: "ally", moving: true }),
  "Structural Dissolution": area("circle", 15, { moving: true }), "Rolling Stone": area("circle", 15, { moving: true }),
  "Slow Release Medication": area("circle", 20, { disposition: "ally", moving: true }),
  "Light of Hope": placed("circle", 15, null, { events: ["target-start"], disposition: "ally", save: null, manualRoll: true }),
  "Earth Meld": placed("circle", 10, 60), "Revealing Mist": placed("circle", 20, 100, { corners: true, events: ["entry"] }),
  "Impulse Signal": placed("circle", 20, 100), "Gravitic Warp": placed("circle", 20, null, { when: "optional", manualRoll: true }),
  "You Shall Not Pass": placed("rect", 10, 60, { events: ["entry", "target-start"], dc: "choice", manualRoll: true }),
  "Crackling Mote": placed("circle", 10, 30, { disposition: "hostile", events: ["movement", "target-start"], persist: true,
    damage: "20", damageType: "force", half: true }),
  "Ring of Purgatory": area("circle", 15, { mode: "paired-area", range: 30, maximum: 1, anchorDisposition: "ally", disposition: "hostile", templates: 2, moving: true, events: ["entry", "target-start"], manualRoll: true }),
  "Exclusion Zone": area("cone", 50, { events: ["entry", "target-start"], dc: "manual" }),
  "Anaesthesia": placed("circle", 15, 20, { events: ["entry", "target-start"], dc: "manual", manualRoll: true, areaMovement: { when: "source-start", feet: 10, reference: "initial" } }),
  "Tear Gas": placed("circle", 15, 60, { corners: true, events: ["entry", "target-start"], dc: "choice" }),
  "Thousand Cuts": area("circle", 15, { moving: true, excludeSource: true, events: ["entry", "target-start"], damage: "3d10", damageType: "slashing" }),
  "Blood Boil": area("circle", 15, { when: "ending", excludeSource: true, manualRoll: true })
};
for (const [actual, shorthand] of Object.entries({ "Salt the Wound": "Salt in the Wound", "Gentle Binding Gaze": "Gentle Binding",
  "Lock-On": "Lock On", "Emergency Camo": "Emergency Camouflage", "EMP Eruption": "EMP",
  "Flash of Lightning": "Flash Lightning", "To Part The Seas": "To Part the Seas", "From on High": "From On High",
  "The Past, Unwritten": "Past Unwritten", "To Take Umbrage": "To Take Umbrage" })) {
  if (reviewed[shorthand]) reviewed[actual] = reviewed[shorthand];
}

export function skillTargetProfile(entry) {
  const skill = entry.operatorSkill ?? entry;
  const effect = skill.effect ?? "";
  const name = entry.name ?? skill.name;
  const reviewedSpecification = reviewed[name];
  // Unreviewed linked Art/weapon targets use token selection, but no guessed ranges or formulas.
  const specification = reviewedSpecification ?? (/choose (?:a|one|an|up to|two|three|five)|target (?:a|one|an)|Creature you|friendly Creature|allied Creature/i.test(effect)
    ? direct(null, { maximum: null, manualRoll: true, save: null }) : undefined);
  const prerequisite = /Spell Save DC/.test(effect) && !/Martial (?:Save )?DC or|Spell Save DC (?:\(your choice\) )?or (?:your )?Martial/.test(effect);
  const save = specification && "save" in specification ? specification.save : effect.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw/i)?.[1]?.slice(0, 3).toLowerCase();
  const dc = specification?.dc ?? (/Martial (?:Save )?DC or|Spell Save DC (?:\(your choice\) )?or (?:your )?Martial/.test(effect) ? "choice"
    : /Spell Save DC/.test(effect) ? "spell" : /Martial (?:Save )?DC/.test(effect) ? "martial" : save ? "manual" : null);
  const damage = effect.match(/(?:takes?|taking|deals?|suffers?)\s+(\d+d\d+)\s+(acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder|bludgeoning|piercing|slashing)\s+Damage/i);
  const base = { id: "activation", when: "activation", manualRoll: !reviewedSpecification, ...specification, save, dc,
    damage: specification && "damage" in specification ? specification.damage : damage?.[1], damageType: specification?.damageType ?? damage?.[2]?.toLowerCase(),
    half: specification?.half ?? /half (?:as much|damage|Damage)/i.test(effect) };
  if (name === "Harpoon Shot") base.damage = entry.parentClass === "Specialist" ? "5d8" : "6d8";
  if (name === "Monitoring" && entry.parentClass === "Vanguard") base.maximum = 4;
  if (specification?.events) base.noInitialRoll = specification.noInitialRoll ?? true;
  if (specification?.events) {
    base.oncePerTurn = /only.*once (?:in a|per) Turn/i.test(effect);
    base.entryOwnTurn = /(?:enters|moves).*during (?:its|their) Turn/i.test(effect);
  }
  const notes = [];
  if (!reviewedSpecification) notes.push("Target restrictions, linked Art/weapon geometry and effect application require source review; use the retained rules and native Art/weapon activities.");
  if (base.mode === "targets" && base.range == null || base.anchor === "placed" && base.range == null) notes.push("The source does not specify a numeric range. Confirm legal placement/targets; no range is invented.");
  if (base.dc === "manual") notes.push("The source does not specify a usable DC. The GM must establish it before a saving throw is offered.");
  if (base.piercing) notes.push("GM must confirm material and thickness for piercing; the engine cannot determine structure thickness.");
  if (base.disposition) notes.push("Confirm ally/hostile status for neutral or secret token dispositions; these are not inferred from ownership.");
  if (/willing|hear|see|Construct|Automaton|ground|flying|moved|cover|Hit Points|weapon|Art\b/i.test(effect)) notes.push("Confirm narrative restrictions, prior events, equipment, and special effects against the source.");
  if (/height|high|fall|elevation|cylinder/i.test(effect)) notes.push("Geometry is 2D; review source heights and elevation manually.");
  // Repeat and delayed phases keep their own identities after Instant activations.
  const phases = [base];
  if (specification?.laterArea) {
    phases.push({ ...specification.laterArea, id: "subsequent", when: "optional" });
    notes.push("Resolve subsequent only after confirming its source action/reaction trigger. Buffs, movement, conditions and riders remain manual.");
  }
  if (specification?.repeat) phases.push({ ...base, id: "subsequent", when: "optional", activation: specification.repeat });
  if (specification?.delayed) phases.push({ ...base, id: "delayed", when: specification.delayed,
    save: null, damage: specification.delayedDamage, damageType: specification.delayedType });
  if (specification?.events) phases.push({ ...base, id: "triggered", when: "triggered", events: specification.events, noInitialRoll: false });
  if (specification?.areaMovement) phases.push({ ...base, id: "movement", when: specification.areaMovement.when, save: null, damage: null,
    areaMovement: specification.areaMovement, repeatable: true, noInitialRoll: false });
  if (name === "Blood Boil") phases.push({ ...base, id: "ending", when: "ending" });
  if (name === "Blood Boil") phases.push({ id: "self-damage", when: "source-end", mode: "self", damage: "1d12", damageType: "fire" });
  if (name === "Exclusion Zone") { const phase = phases.find(phase => phase.id === "triggered"); phase.damage = null; }
  if (name === "Harpoon Shot") phases.push({ ...base, id: "subsequent", when: "target-start", save: null, damage: entry.parentClass === "Specialist" ? "5d8" : "3d8" });
  if (name === "Gentle Binding Gaze") {
    phases.push({ ...base, id: "subsequent", when: "optional", activation: "bonus" });
    phases.push({ ...base, id: "escape", when: "target-end" });
  }
  if (name === "Torrential Downpour") phases.push({ ...base, id: "pulse", when: "source-start", repeatable: true });
  if (name === "Punishment") phases.push({ ...base, id: "subsequent", when: "optional", manualRoll: false, oncePerTurn: true, ownTurn: true });
  if (name === "Wolfpack") phases.push({ ...base, id: "subsequent", when: "optional", maximum: 2 });
  if (name === "Venom Fang") phases.push({ ...base, id: "poison", when: "target-end", damage: "2d8", half: false });
  if (name === "Omen of Defeat") phases.push({ ...base, id: "escape", when: "target-end" });
  if (name === "Electrowebbing") {
    phases.push({ ...base, id: "restrained-damage", when: "optional", mode: "targets", maximum: null, range: null, save: null, damage: "2d6", damageType: "lightning" });
    notes.push("At each restrained creature's turn end, select creatures still Restrained by this activation, then resolve restrained-damage. Escape checks and ending removal remain manual.");
  }
  if (["Nature's Blessing", "Healing Wave"].includes(name)) phases.push({ id: "healing", when: "optional", mode: "targets", maximum: 1,
    allowedArea: true, disposition: "ally", healing: name === "Healing Wave" ? "2d6" : "3d6" });
  if (!reviewedSpecification && /when|whenever|subsequent|each of your|next (?:Attack|Turn)|Skill ends/i.test(effect)) {
    phases.push({ id: "manual", when: "optional", manualRoll: true });
    notes.push("Later actions/triggers remain source-confirmed manual phases; use Mark next Skill action before a linked native roll.");
  }
  return { version: PROFILE_VERSION, sourceId: skill.sourceId ?? entry.id, sourceName: name, sourceEffect: effect,
    status: reviewedSpecification ? "supported-with-manual-effects" : "manual", prerequisite: prerequisite ? "spellDC" : null, notes, phases };
}

export function spellSaveDC(actor) {
  const ability = actor.system?.attributes?.spellcasting;
  // D&D5e derives an 8+PB DC even without a casting ability. That is not an AK5e Spell Save DC.
  if (!ability || !actor.system?.abilities?.[ability]) return null;
  const dc = Number(actor.system?.attributes?.spell?.dc ?? actor.system?.attributes?.spelldc);
  return Number.isFinite(dc) && dc > 0 ? dc : null;
}

export function validateSkillPrerequisites(actor, skill, confirmation) {
  const effect = skill.targetProfile?.sourceEffect ?? skill.effect ?? "";
  if (/If your current Hit Points are greater than 0/i.test(effect) && !(actor.system?.attributes?.hp?.value > 0)) throw new Error("This Skill requires current Hit Points greater than 0.");
  if (/Spell Save DC/.test(effect) && !/Martial (?:Save )?DC or|Spell Save DC (?:\(your choice\) )?or (?:your )?Martial/.test(effect)
    && spellSaveDC(actor) == null) throw new Error("This Skill requires a Spell Save DC. Configure a valid spellcasting ability before activation.");
  if (skill.targetProfile?.notes?.length && !confirmation) throw new Error("Confirm the source prerequisites and manual restrictions before activation.");
}

/** Native activity schema, shared by generation, explicit updates, and runtime roll clones. */
export function nativePhaseActivities(profile) {
  const activities = {};
  profile.phases.forEach((phase, index) => {
    const id = `ak5ePhase${String(index).padStart(7, "0")}`;
    const damage = phase.damage && !phase.manualRoll && !phase.weapon
      ? [{ custom: { enabled: true, formula: phase.damage }, types: [phase.damageType] }] : [];
    const type = phase.healing ? "heal" : phase.save && phase.mode ? "save" : damage.length ? "damage" : "utility";
    activities[id] = { _id: id, type, name: `Resolve ${phase.id}`, activation: { type: phase.id === "activation" ? "" : phase.activation ?? "" }, consumption: { targets: [], spellSlot: false },
      ...(type === "heal" ? { healing: { custom: { enabled: true, formula: phase.healing }, types: ["healing"] } } : {}),
      ...(["save", "damage"].includes(type) ? { damage: { parts: damage, ...(type === "save" ? { onSave: phase.half ? "half" : "none" } : {}) } } : {}),
      ...(type === "save" ? { save: { ability: [phase.save], dc: { calculation: phase.dc === "spell" ? "spellcasting" : "", formula: "" } } } : {}) };
  });
  return activities;
}
