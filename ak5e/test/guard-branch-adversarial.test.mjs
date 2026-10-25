import test from "node:test";
import assert from "node:assert/strict";
import { guardFixture, world } from "./guard-fixture.mjs";
import { previewGuardProgression, applyGuardProgression, inspectGuardFields } from "../scripts/guard-progression.mjs";
import { guardUses } from "../scripts/guard-uses.mjs";
import { registerArtsbladeHooks, artsbladePreRollAttack, artsbladePreRollDamage } from "../scripts/artsblade-features.mjs";
import { getReactions, setReactionStore } from "../scripts/trigger-events.mjs";
import { registerGuardFeatureHooks } from "../scripts/guard-features.mjs";
import { opaqueKey } from "../scripts/operation-kernel.mjs";

const use = (actor, command, data, id) => guardUses.command(actor, command, {
  ...(command === "bladeArt" || command === "castSpellswordArt" ? { martialDcAbility: "str" } : {}), confirmed: true, ...data
}, id);

function configuredWorld(combat = null) {
  const documents = world(combat);
  const reactionState = new Map();
  setReactionStore({
    read: actor => reactionState.get(actor.uuid),
    async write(actor, state) { reactionState.set(actor.uuid, structuredClone(state)); }
  });
  registerGuardFeatureHooks();
  registerArtsbladeHooks();
  return { game, documents };
}

function selectedEquipment(actor) {
  const choices = { startingEquipment: { mode: "items" } };
  const fields = inspectGuardFields(actor, choices);
  for (const field of fields.filter(field => field.key.startsWith("startingEquipment.") && field.key !== "startingEquipment.mode")) {
    choices.startingEquipment[field.key.split(".").at(-1)] = field.options[0].value;
  }
  return choices.startingEquipment;
}

function preserveEmbeddedItemTypes(actor) {
  const create = actor.createEmbeddedDocuments.bind(actor);
  actor.createEmbeddedDocuments = async (type, data) => {
    const documents = await create(type, data);
  documents.forEach((document, index) => {
    document.type = data[index].type ?? type;
    document.parent = actor;
    document.uuid = `${actor.uuid}.Item.${document.id}`;
  });
    return documents;
  };
}

function addKnownArt(actor, name = "Frost Nova", level = 1) {
  actor.items.set(`art-${name}`, {
    id: `art-${name}`, type: "spell", name, system: { level }, flags: { ak5e: { artsPool: "frost" } },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; }
  });
}

test("reapplying the same reviewed Guard progression does not add HP, ASI, cash, or grants again", async () => {
  configuredWorld();
  const actor = guardFixture({ level: 5 });
  preserveEmbeddedItemTypes(actor);
  actor.system.abilities.str.value = 14;
  actor.system.attributes.hp.max = 20;
  const choices = {
    branch: "subclass-guard-artsblade",
    artPools: ["frost"],
    fightingStyle: "duelling",
    saves: ["con"], skills: ["ath", "acr", "ak5elore"], tool: "Maintenance Kit",
    startingEquipment: { mode: "cash" },
    hp: { 1: { mode: "fixed", roll: 10 }, 2: { mode: "fixed", roll: 6 }, 3: { mode: "existing" }, 4: { mode: "existing" }, 5: { mode: "existing" } },
    asi: { 4: { increases: [{ ability: "str", amount: 2 }] } }
  };

  let preview = await previewGuardProgression(actor, choices);
  await applyGuardProgression(actor, { confirmed: true, contextKey: preview.contextKey, ...choices });
  const grantedFeatureIds = [...actor.items.values()].map(item => item.flags?.ak5e?.chapterThreeId);
  assert.ok(grantedFeatureIds.includes("subclass-feature-guard-artsblade-1st-level-sword-and-sorcery-205"));
  assert.ok(grantedFeatureIds.includes("subclass-feature-guard-artsblade-1st-level-resonance-4121"));
  assert.ok(grantedFeatureIds.includes("subclass-feature-guard-artsblade-4th-level-cut-through-chaos-7697"));
  const afterFirst = {
    hp: actor.system.attributes.hp.max,
    str: actor.system.abilities.str.value,
    cp: actor.system.currency.cp,
    items: actor.items.size
  };

  preview = await previewGuardProgression(actor, choices);
  await applyGuardProgression(actor, { confirmed: true, contextKey: preview.contextKey, ...choices });
  assert.deepEqual({
    hp: actor.system.attributes.hp.max,
    str: actor.system.abilities.str.value,
    cp: actor.system.currency.cp,
    items: actor.items.size
  }, afterFirst, "a second confirmed apply of the same reviewed choices must be idempotent");
});

test("reapplying Guard starting equipment does not create another copy of each selected item", async () => {
  configuredWorld();
  const actor = guardFixture({ level: 1 });
  preserveEmbeddedItemTypes(actor);
  const choices = {
    branch: "subclass-guard-artsblade", artPools: ["frost"], fightingStyle: "duelling", saves: ["con"],
    skills: ["ath", "acr", "ak5elore"], tool: "Maintenance Kit",
    startingEquipment: selectedEquipment(actor),
    hp: { 1: { mode: "existing" } }
  };
  let preview = await previewGuardProgression(actor, choices);
  await applyGuardProgression(actor, { confirmed: true, contextKey: preview.contextKey, ...choices });
  const granted = actor.items.size;
  preview = await previewGuardProgression(actor, choices);
  await applyGuardProgression(actor, { confirmed: true, contextKey: preview.contextKey, ...choices });
  assert.equal(actor.items.size, granted, "equipment and feature grants must not be duplicated by setup retries");
});

test("Spellsword Arts are fixed at the Artsblade's maximum Art level", async () => {
  configuredWorld();
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  actor.flags.ak5e.resourcePools.spellswordPoints = { value: 1, max: 1 };
  actor.flags.ak5e.guardProgression = { choices: { artPools: ["frost"] } };
  addKnownArt(actor);
  const result = await use(actor, "castSpellswordArt", { artName: "Frost Nova", castingLevel: 1 }, "fixed-art-level");
  assert.equal(result.castingLevel, 2, "at Guard level 5, the source table requires level 2 casting");
});

test("a non-GM owner can use a Guard feature out of turn and override a shortfall with a public card", async () => {
  configuredWorld({ started: true, id: "combat-artsblade-player", round: 1, turn: 0, turns: [{ actor: { uuid: "Actor.other" } }] });
  game.combat.turns = [{ actor: { uuid: "Actor.other" } }];
  const actor = guardFixture({ level: 5, branch: "artsblade", aggression: 1, owner: true });
  await assert.rejects(
    use(actor, "augmentedAssault", {}, "augmented-shortfall"),
    error => error.name === "AK5eWarnings" && error.warnings.some(w => w.id === "aggression")
  );
  assert.equal(actor.flags.ak5e.resourcePools.aggression.value, 1, "the warning leaves resources untouched before confirmation");

  const result = await use(actor, "augmentedAssault", { overrides: ["aggression"] }, "augmented-player-override");
  assert.equal(result.aggressionSpent, 2);
  assert.equal(actor.flags.ak5e.resourcePools.aggression.value, 0, "overridden shortfalls clamp at zero");
  const card = game.messages.find(message => message.flags?.ak5e?.guardUsesUse?.useId === "augmented-player-override");
  assert.ok(card, "the non-GM player's confirmed use posts a public chat card");
  assert.match(card.content, /Used anyway:/);
  assert.match(card.content, /Aggression short by 1/);
});

test("an invalid Blade Art pool is rejected instead of silently becoming Flame", async () => {
  configuredWorld();
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  actor.flags.ak5e.guardProgression = { choices: { artPools: ["frost"] } };
  await assert.rejects(
    use(actor, "bladeArt", { pool: "frosty", targetUuid: "Actor.foe1" }, "invalid-blade-pool"),
    error => error.name === "AK5eWarnings" && error.warnings.some(warning => warning.id === "pool")
  );
  const result = await use(actor, "bladeArt", { pool: "frosty", targetUuid: "Actor.foe1", overrides: ["pool"] }, "invalid-blade-pool-override");
  assert.equal(result.pool, "frost", "Use anyway keeps the chosen source pool instead of substituting another element");
  assert.equal(result.damageType, "cold");
});

test("the sheet's `artPool` payload preserves Frost as cold damage", async () => {
  configuredWorld();
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  actor.flags.ak5e.guardProgression = { choices: { artPools: ["frost"] } };
  const result = await use(actor, "bladeArt", { artPool: "frost", targetUuid: "Actor.foe1" }, "sheet-frost-payload");
  const receipt = guardUses.receipt(actor, "sheet-frost-payload");
  assert.equal(result.pool, "frost");
  assert.equal(result.damageType, "cold");
  assert.deepEqual(receipt.damageParts, [{ formula: "2d6", type: "cold" }]);
});

test("a player's second Blade Art in one turn gets the source frequency warning", async () => {
  configuredWorld({ started: true, id: "combat-artsblade-frequency", round: 1, turn: 0 });
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  await use(actor, "bladeArt", { pool: "frost", targetUuid: "Actor.foe1" }, "frequency-first-blade");
  await assert.rejects(
    use(actor, "bladeArt", { pool: "frost", targetUuid: "Actor.foe2" }, "frequency-second-blade"),
    error => error.name === "AK5eWarnings" && error.warnings.some(w => /frequency|once per turn|once per Turn/i.test(`${w.id} ${w.text}`))
  );
});

test("Augmented Assault warns after its two Blade Arts and does not permit a non-Blade Art", async () => {
  configuredWorld({ started: true, id: "combat-artsblade-augmented-frequency", round: 1, turn: 0 });
  const actor = guardFixture({ level: 5, branch: "artsblade", aggression: 4 });
  actor.flags.ak5e.resourcePools.spellswordPoints = { value: 3, max: 3 };
  actor.flags.ak5e.guardProgression = { choices: { artPools: ["frost"] } };
  addKnownArt(actor);
  await use(actor, "augmentedAssault", {}, "augmented-frequency-activate");
  await use(actor, "bladeArt", { pool: "frost", targetUuid: "Actor.foe1" }, "augmented-frequency-blade-1");
  await use(actor, "bladeArt", { pool: "frost", targetUuid: "Actor.foe2" }, "augmented-frequency-blade-2");
  await assert.rejects(
    use(actor, "bladeArt", { pool: "frost", targetUuid: "Actor.foe3" }, "augmented-frequency-blade-3"),
    error => error.name === "AK5eWarnings"
  );
  await assert.rejects(
    use(actor, "castSpellswordArt", { artName: "Frost Nova" }, "augmented-frequency-non-blade"),
    error => error.name === "AK5eWarnings"
  );
});

test("Cut Through Chaos persists a player-clicked attack roll for its spell-attack mode", async () => {
  configuredWorld({ started: true, id: "combat-artsblade-cut-roll", round: 1, turn: 0 });
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  actor.flags.ak5e.resourcePools.cutThroughChaos = { value: 3, max: 3 };
  let evaluations = 0;
  globalThis.Roll = class CountedAttackRoll {
    constructor(formula) { this.formula = formula; }
    async evaluate() { evaluations++; this.total = 17; return this; }
    async toMessage() { return this; }
  };
  const result = await use(actor, "cutThroughChaos", { mode: "spellAttack" }, "cut-through-roll");
  const receipt = guardUses.receipt(actor, "cut-through-roll");
  assert.equal(receipt.status, "awaitingRoll", "the feature must wait for its required melee attack roll");
  assert.ok(receipt.formula || receipt.rolls?.some(roll => roll.id === "cutAttack"), "the player has a roll control to click");
  assert.equal(receipt.roll, undefined, "no attack result is computed before the owner clicks the roll");
  assert.equal(evaluations, 0, "the confirmed use does not evaluate the attack roll for the player");
  assert.equal(result.mode, "spellAttack", "the pre-roll result contains only the selected mode and instructions");
  await guardUses.command(actor, "useRoll", { useId: receipt.id }, "cut-through-roll-click");
  assert.equal(evaluations, 1, "only the explicit chat-card Roll button evaluates the feature attack");
  assert.equal(guardUses.receipt(actor, receipt.id).result.attackTotal, 17);
});

test("Cut Through Chaos offers its comparison roll for a save but no attack roll for Reaction Art mode", async () => {
  configuredWorld({ started: true, id: "combat-artsblade-cut-modes", round: 1, turn: 0 });
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  actor.flags.ak5e.resourcePools.cutThroughChaos = { value: 3, max: 3 };
  await use(actor, "cutThroughChaos", { mode: "savingThrow" }, "cut-through-save-roll");
  const saveReceipt = guardUses.receipt(actor, "cut-through-save-roll");
  assert.equal(saveReceipt.status, "awaitingRoll");
  assert.ok(saveReceipt.formula || saveReceipt.rolls?.some(roll => roll.id === "cutAttack"));

  const other = guardFixture({ level: 5, branch: "artsblade" });
  other.id = "guard2";
  other.uuid = "Actor.guard2";
  other.flags.ak5e.resourcePools.cutThroughChaos = { value: 3, max: 3 };
  await use(other, "cutThroughChaos", { mode: "reactionArt" }, "cut-through-reaction-art");
  const artReceipt = guardUses.receipt(other, "cut-through-reaction-art");
  assert.equal(artReceipt.status, "complete", "Reaction Art casts the known Art and has no comparison attack roll");
  assert.equal(artReceipt.formula, undefined);
});

test("a failed receipt write cannot strand Cut Through Chaos's Reaction", async () => {
  configuredWorld({ started: true, id: "combat-artsblade-receipt-fault", round: 1, turn: 0 });
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  actor.flags.ak5e.resourcePools.cutThroughChaos = { value: 3, max: 3 };
  let fail = true;
  const update = actor.update.bind(actor);
  actor.update = async changes => {
    if (fail && changes["flags.ak5e.guardUses"]) { fail = false; throw new Error("injected receipt write failure"); }
    return update(changes);
  };
  await assert.rejects(use(actor, "cutThroughChaos", { mode: "spellAttack" }, "cut-through-write-fault"), /injected receipt write failure/);
  assert.equal(getReactions(actor).available, 1, "persisted intent and retry safety must precede the Reaction side effect");
  assert.equal(guardUses.receipt(actor, "cut-through-write-fault"), null, "a failed first receipt write leaves no phantom use");
});

test("Blade Art waits for the owner to click its damage roll and does not mark an unrolled save immune", async () => {
  configuredWorld({ started: true, id: "combat-artsblade", round: 1, turn: 0 });
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  let evaluations = 0;
  class CountedDamageRoll {
    constructor(formula) { this.formula = formula; }
    async evaluate() { evaluations++; this.total = 7; return this; }
  }
  globalThis.CONFIG = { Dice: { DamageRoll: CountedDamageRoll } };

  const first = await use(actor, "bladeArt", { pool: "frost", targetUuid: "Actor.foe1" }, "blade-before-save");
  assert.equal(evaluations, 0, "using the feature only posts the roll; it does not evaluate damage dice");
  assert.equal(first.immuneToSave, false);
  assert.equal(guardUses.state(actor).data.bladeArtSaves?.["Actor.foe1"], undefined,
    "the repeated-save marker is recorded only after the target actually makes its save");

  const second = await use(actor, "bladeArt", { pool: "frost", targetUuid: "Actor.foe1", overrides: ["frequency"] }, "blade-still-before-save");
  assert.equal(second.immuneToSave, false, "a pending or unrolled save does not grant save immunity");
  await guardUses.command(actor, "useRoll", { useId: "blade-before-save" }, "blade-roll");
  assert.equal(evaluations, 1, "only the explicit Roll button path evaluates the Blade Art damage");
});

test("only the target owner's matching native Frost save records Blade Art's turn-limited immunity marker", async () => {
  const { game: activeGame, documents } = configuredWorld({
    started: true, id: "combat-artsblade-save", round: 1, turn: 0,
    turns: [{ actor: { uuid: "Actor.guard1" } }, { actor: { uuid: "Actor.other" } }]
  });
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  preserveEmbeddedItemTypes(actor);
  const setupChoices = {
    branch: "subclass-guard-artsblade", artPools: ["frost"], fightingStyle: "duelling",
    saves: ["con"], skills: ["ath", "acr", "ak5elore"], tool: "Maintenance Kit",
    startingEquipment: { mode: "cash" },
    hp: { 1: { mode: "fixed", roll: 10 }, 2: { mode: "fixed", roll: 6 }, 3: { mode: "existing" }, 4: { mode: "existing" }, 5: { mode: "existing" } },
    asi: { 4: { increases: [{ ability: "str", amount: 2 }] } }
  };
  const setupPreview = await previewGuardProgression(actor, setupChoices);
  await applyGuardProgression(actor, { confirmed: true, contextKey: setupPreview.contextKey, ...setupChoices });
  actor.flags.ak5e.guardProgression = { choices: { artPools: ["frost"] } };
  documents.set(actor.uuid, actor);
  const target = {
    id: "foe1", uuid: "Actor.foe1", documentName: "Actor", name: "Foe", isOwner: true, effects: new Map(),
    system: { attributes: { hp: { value: 12, max: 12, temp: 0 } } },
    testUserPermission(user, permission) { return permission === "OWNER" && user?.id === "foe-owner"; },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async update() { return this; },
    async createEmbeddedDocuments(type, data) {
      const created = data.map((entry, index) => ({ ...structuredClone(entry), id: `effect-${index}`, uuid: `${this.uuid}.ActiveEffect.effect-${index}`, parent: this,
        getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
        async update(changes) { for (const [path, value] of Object.entries(changes)) { const keys = path.split("."); let node = this; while (keys.length > 1) node = node[keys.shift()] ??= {}; node[keys[0]] = value; } },
        async delete() { this.parent.effects.delete(this.id); }
      }));
      for (const effect of created) this.effects.set(effect.id, effect);
      return created;
    },
    async deleteEmbeddedDocuments(_type, ids) { for (const id of ids) this.effects.delete(id); }
  };
  documents.set(target.uuid, target);
  const result = await use(actor, "bladeArt", { artPool: "frost", targetUuid: target.uuid }, "blade-save-evidence");
  assert.equal(result.immuneToSave, false);
  const save = guardUses.receipt(actor, "blade-save-evidence").saves.find(entry => entry.id === "blade-resonance");
  assert.deepEqual({ uuid: save.uuid, ability: save.ability, dc: save.dc }, { uuid: target.uuid, ability: "con", dc: 15 });

  const message = ownerId => ({
    documentName: "ChatMessage", id: "save-1", uuid: "ChatMessage.save-1", author: { id: ownerId, isGM: false },
    speaker: { actor: target.id }, rolls: [{ total: 12 }],
    flags: { dnd5e: { roll: { type: "save", ability: "con" } }, ak5e: { playSave: {
      ns: "guardUses", sourceUuid: actor.uuid, useId: "blade-save-evidence", targetUuid: target.uuid, saveId: save.id
    } } }
  });

  activeGame.users.activeGM = { id: "gm" };
  activeGame.user = { id: "gm", isGM: true };
  await assert.rejects(guardUses.handleSaveMessage(message("foe-owner"), {}, "foe-owner"), /damage before resolving/,
    "a damage-triggered save is not offered before the player clicks the damage roll");
  globalThis.CONFIG = { Dice: { DamageRoll: class {
    async evaluate() { this.total = 7; return this; }
  } } };
  await guardUses.command(actor, "useRoll", { useId: "blade-save-evidence" }, "damage-before-save");
  assert.equal(guardUses.receipt(actor, "blade-save-evidence").status, "awaitingSave");
  await assert.rejects(guardUses.handleSaveMessage(message("other-player"), {}, "other-player"), /owner/i);
  assert.equal(guardUses.receipt(actor, "blade-save-evidence").saves[0].resolved, undefined,
    "a save from a non-owner is not accepted as evidence");
  const mismatchedAbility = message("foe-owner");
  mismatchedAbility.flags.dnd5e.roll.ability = "dex";
  await assert.rejects(guardUses.handleSaveMessage(mismatchedAbility, {}, "foe-owner"), /matching native saving throw/i);
  assert.equal(guardUses.receipt(actor, "blade-save-evidence").saves[0].resolved, undefined,
    "a native save for the wrong ability is not accepted as evidence");
  const nativeSave = message("foe-owner");
  documents.set(nativeSave.uuid, nativeSave);
  await guardUses.handleSaveMessage(nativeSave, {}, "foe-owner");
  assert.equal(guardUses.receipt(actor, "blade-save-evidence").saves[0].resolved, true);
  assert.equal(guardUses.receipt(actor, "blade-save-evidence").result.riderApplied, "frost", "a failed owner save applies the source Resonance rider");
  assert.equal(target.effects.size, 1, "the failed Frost save records its temporary movement effect on the target");
  assert.equal(guardUses.state(actor).data.bladeArtSaves[opaqueKey(target.uuid)].untilTurnKey, "combat-artsblade-save:2:0",
    "save immunity ends when this Artsblade's next turn begins, after intervening creatures act");

  const later = await use(actor, "bladeArt", { artPool: "frost", targetUuid: target.uuid, overrides: ["frequency"] }, "blade-save-repeat");
  assert.equal(later.immuneToSave, true, "a later Blade Art before the Artsblade's next turn begins does not ask this target to save again");
  activeGame.combat.turn = 1;
  const duringOtherTurn = await use(actor, "bladeArt", { artPool: "frost", targetUuid: target.uuid }, "blade-save-other-turn");
  assert.equal(duringOtherTurn.immuneToSave, true, "the save exemption survives other creatures' turns");
  activeGame.combat.round = 2;
  activeGame.combat.turn = 0;
  const atNextArtsbladeTurn = await use(actor, "bladeArt", { artPool: "frost", targetUuid: target.uuid }, "blade-save-next-turn");
  assert.equal(atNextArtsbladeTurn.immuneToSave, false, "the exemption expires at the beginning of the Artsblade's next turn");
  await guardUses.command(actor, "undoUse", { useId: "blade-save-evidence" }, "undo-blade-save-evidence");
  assert.equal(guardUses.state(actor).data.bladeArtSaves?.[opaqueKey(target.uuid)], undefined, "undo clears the marker created by this verified save");
});

test("undo restores the Artsblade use ledger and its Reaction receipt", async () => {
  configuredWorld({ started: true, id: "combat-artsblade-undo", round: 1, turn: 0 });
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  actor.flags.ak5e.resourcePools.cutThroughChaos = { value: 3, max: 3 };
  const result = await use(actor, "cutThroughChaos", { mode: "spellAttack" }, "cut-through-undo");
  assert.equal(result.useSpent, 1);
  assert.equal(actor.flags.ak5e.resourcePools.cutThroughChaos.value, 2);
  assert.equal(guardUses.receipt(actor, "cut-through-undo").reaction.spent, true);
  assert.equal(getReactions(actor).available, 0);

  await guardUses.command(actor, "undoUse", { useId: "cut-through-undo" }, "undo-cut-through");
  assert.equal(actor.flags.ak5e.resourcePools.cutThroughChaos.value, 3);
  assert.equal(getReactions(actor).available, 1, "undo restores the Reaction that this use spent");
});

test("undo restores Artsblade state.data changed by the use", async () => {
  configuredWorld({ started: true, id: "combat-artsblade-data-undo", round: 1, turn: 0 });
  const actor = guardFixture({ level: 5, branch: "artsblade", aggression: 4 });
  const before = structuredClone(guardUses.state(actor).data);
  await use(actor, "augmentedAssault", {}, "augmented-assault-data");
  assert.equal(guardUses.state(actor).data.augmentedAssaultTurn, "combat-artsblade-data-undo:1:0");
  await guardUses.command(actor, "undoUse", { useId: "augmented-assault-data" }, "undo-augmented-assault");
  assert.deepEqual(guardUses.state(actor).data, before, "receipt undo restores module-owned use ledger data");
  assert.equal(actor.flags.ak5e.resourcePools.aggression.value, 4);
});

test("player undo remains available within its encounter epoch and locks after the window advances", async () => {
  configuredWorld({ started: true, id: "combat-artsblade-lock", round: 1, turn: 0 });
  let epoch = 4;
  game.settings.get = () => epoch;
  const actor = guardFixture({ level: 5, branch: "artsblade" });
  actor.flags.ak5e.resourcePools.cutThroughChaos = { value: 3, max: 3 };
  await use(actor, "cutThroughChaos", { mode: "spellAttack" }, "cut-through-epoch-lock");
  await guardUses.command(actor, "undoUse", { useId: "cut-through-epoch-lock" }, "undo-before-window-lock");
  assert.equal(actor.flags.ak5e.resourcePools.cutThroughChaos.value, 3, "the player can undo during the current encounter window");

  await use(actor, "cutThroughChaos", { mode: "spellAttack" }, "cut-through-after-reuse");
  epoch++;
  await assert.rejects(
    guardUses.command(actor, "undoUse", { useId: "cut-through-after-reuse" }, "undo-after-window-lock"),
    /encounter window has ended/
  );
  assert.equal(actor.flags.ak5e.resourcePools.cutThroughChaos.value, 2, "an old window's receipt remains locked and its resource is not restored");
});

test("Crude Resonance bonuses apply for the source-defined turn and only to melee attack and damage rolls", () => {
  configuredWorld({ started: true, id: "combat-artsblade-resonance", round: 1, turn: 0 });
  const actor = guardFixture({ level: 10, branch: "artsblade" });
  game.combat.turns = [{ actor }, { actor: { uuid: "Actor.other" } }];
  actor.flags.ak5e.guardUses = { data: { forceResonanceUntilTurn: "combat-artsblade-resonance:2:0", forceResonanceBonus: 1 } };

  const meleeAttack = { subject: { actor, actionType: "mwak" }, rolls: [{ parts: ["1d20"] }] };
  artsbladePreRollAttack(meleeAttack);
  assert.ok(meleeAttack.rolls[0].parts.includes("1"));

  const rangedAttack = { subject: { actor, actionType: "rwak" }, rolls: [{ parts: ["1d20"] }] };
  artsbladePreRollAttack(rangedAttack);
  assert.equal(rangedAttack.rolls[0].parts.includes("1"), false, "Resonance grants a bonus to melee attacks only");

  const meleeDamage = { subject: { actor, actionType: "mwak" }, rolls: [{ parts: ["1d8"] }] };
  artsbladePreRollDamage(meleeDamage);
  assert.ok(meleeDamage.rolls[0].parts.includes("1"));

  game.combat.turn = 1;
  const duringOtherTurn = { subject: { actor, actionType: "mwak" }, rolls: [{ parts: ["1d20"] }] };
  artsbladePreRollAttack(duringOtherTurn);
  assert.ok(duringOtherTurn.rolls[0].parts.includes("1"), "the benefit remains active during intervening creatures' turns");

  game.combat.round = 2;
  game.combat.turn = 0;
  const throughNextArtsbladeTurn = { subject: { actor, actionType: "mwak" }, rolls: [{ parts: ["1d20"] }] };
  artsbladePreRollAttack(throughNextArtsbladeTurn);
  assert.ok(throughNextArtsbladeTurn.rolls[0].parts.includes("1"), "the benefit remains through the end of the Artsblade's next turn");
  game.combat.turn = 1;
  const afterNextArtsbladeTurn = { subject: { actor, actionType: "mwak" }, rolls: [{ parts: ["1d20"] }] };
  artsbladePreRollAttack(afterNextArtsbladeTurn);
  assert.equal(afterNextArtsbladeTurn.rolls[0].parts.includes("1"), false, "the bonus expires at the end of the Artsblade's next turn");
});
