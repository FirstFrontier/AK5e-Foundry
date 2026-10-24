/**
 * Specialist sheet UI: header control and Features-tab panel that open guided dialogs.
 * Opening the panel or dialogs never writes to Actor state (WORKFLOW.md §3.2: confirm before use).
 */
import {
  specialistProfile,
  specialistLevel,
  specialistBranch,
  specialistState,
  specialistDC,
  martialDC,
  isSpecialist,
  isExecutor,
  isHookmaster,
  isInfuser,
  isInventor,
  isSkyranger,
  isDollkeeper,
  isTrapmaster,
  calculateInventorDC,
  calculateTrapDC,
  pbForLevel,
  flag
} from "./specialist-rules.mjs";
import {
  hasWeaponSpecialisation,
  getWeaponSpecialisation,
  hasShowYourStyle,
  hasWeaponAdept,
  hasWeaponExpertise,
  hasFallingUpwards,
  hasWeaponMastery
} from "./specialist-features.mjs";
import { previewSpecialistSetup, applySpecialistSetup } from "./specialist-setup.mjs";
import { previewSpecialistProgression, applySpecialistProgression, inspectSpecialistFields } from "./specialist-progression.mjs";
import { specialistUses, recordSpecialistRuling } from "./specialist-uses.mjs";
import { confirmPlayUse, openPlayUndoList, renderPlayUseCard } from "./play-uses-sheet.mjs";
import { getPool } from "./resource-pools.mjs";
import { getExecutorPath, getDeathmarkState } from "./executor-features.mjs";
import { getHookedWeapon, getHookmasterState, canConvertWeaponToHook, listItems } from "./hookmaster-features.mjs";
import { calculateInfuserDC, calculateInfusionRange, getActiveInfusion } from "./infuser-features.mjs";
import { getItemModifications } from "./inventor-features.mjs";
import { getFuel, getFuelMax, AIR_DOCTRINE_NAMES } from "./skyranger-features.mjs";




let installed = false;
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const actorFor = app => app?.document?.documentName === "Actor" ? app.document : app?.actor?.documentName === "Actor" ? app.actor : null;
const safe = fn => Promise.resolve().then(fn).catch(error => { console.error("AK5e | Specialist UI", error); ui?.notifications?.error?.(error?.message ?? String(error)); });
const node = (tag, content, cls) => { const el = document.createElement(tag); if (content != null) el.textContent = String(content); if (cls) el.className = cls; return el; };
const button = (label, handler, cls = "") => {
  const el = node("button", label, cls); el.type = "button";
  el.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); el.disabled = true; safe(handler).finally(() => { el.disabled = false; }); });
  return el;
};
const operationId = () => (globalThis.foundry?.utils?.randomID ? globalThis.foundry.utils.randomID() : Math.random().toString(36).slice(2));
const eligible = actor => actor?.type === "character" && isSpecialist(actor);

function getProwessBadgeText(actor, profile) {
  const level = profile.level ?? 1;
  const pool = getPool(actor, "prowess");
  const max = pool?.max ?? pbForLevel(level);
  const val = pool?.value ?? 0;
  return `Prowess: ${val} / ${max}`;
}

function getDeathmarkStateText(actor) {
  const dm = getDeathmarkState(actor);
  const path = getExecutorPath(actor);
  const pathLabel = path === "hunter" ? "Hunter" : path === "bodyguard" ? "Bodyguard" : "Unchosen";
  if (!dm.held && dm.holder === "target") {
    return dm.targetName ? `Deathmark: Marked (${dm.targetName}) [${pathLabel}]` : `Deathmark: Marked [${pathLabel}]`;
  }
  return `Deathmark: Held [${pathLabel}]`;
}

function getHookedWeaponStatusText(actor) {
  const hookFlag = actor.getFlag?.("ak5e", "hookmaster")?.hookedWeapon ?? actor.flags?.ak5e?.hookmaster?.hookedWeapon;
  const items = Array.from(actor.items ?? []);
  const hookItem = items.find(i => i.getFlag?.("ak5e", "hookmaster")?.isHooked || i.flags?.ak5e?.hookmaster?.isHooked || i.getFlag?.("ak5e", "isHooked") || i.flags?.ak5e?.isHooked);
  if (hookItem?.name) return `Hooked Weapon: ${hookItem.name}`;
  if (hookFlag?.name) return `Hooked Weapon: ${hookFlag.name}`;
  if (hookFlag) return "Hooked Weapon: Active";
  return "Hooked Weapon: None";
}

function getActiveInfusionsCountText(actor) {
  const infFlag = actor.getFlag?.("ak5e", "infuser")?.activeInfusions ?? actor.flags?.ak5e?.infuser?.activeInfusions;
  let count = 0;
  if (Array.isArray(infFlag)) count = infFlag.length;
  else if (typeof infFlag === "number") count = infFlag;
  else if (infFlag && typeof infFlag === "object") count = Object.keys(infFlag).length;
  return `Active Infusions: ${count}`;
}

function getInventionsBadgeText(actor) {
  const pool = getPool(actor, "inventions");
  const level = specialistLevel(actor) ?? 1;
  const max = pool?.max ?? (2 * pbForLevel(level));
  const val = pool?.value ?? 0;
  return `Inventions: ${val} / ${max}`;
}

function getActiveModificationsCountText(actor) {
  const items = listItems(actor.items);
  let count = 0;
  for (const item of items) {
    count += getItemModifications(item).length;
  }
  return `Active Modifications: ${count}`;
}

export async function openSpecialistControls(actor) {
  const profile = specialistProfile(actor);
  const level = profile.level ?? 1;
  const branch = profile.branch;
  const sDC = specialistDC(actor);
  const mDC = martialDC(actor);
  const pool = getPool(actor, "prowess");
  const prowessVal = pool?.value ?? 0;
  const prowessMax = pool?.max ?? pbForLevel(level);

  const sections = [];

  // Summary section
  sections.push(`
    <div class="ak5e-specialist-status">
      <h4>${esc(actor.name)} — Specialist Level ${level}${branch ? ` (${branch.toUpperCase()})` : ""}</h4>
      <p><strong>Specialist DC:</strong> ${sDC} · <strong>Martial DC:</strong> ${mDC}${isInfuser(actor) ? ` · <strong>Infuser DC:</strong> ${calculateInfuserDC(actor)}` : ""}${isInventor(actor) ? ` · <strong>Inventor DC:</strong> ${calculateInventorDC(actor)}` : ""}${isTrapmaster(actor) ? ` · <strong>Trap DC:</strong> ${calculateTrapDC(actor)}` : ""}</p>
      <div class="ak5e-specialist-pools-summary ak5e-specialist-badges">
        <span class="ak5e-specialist-badge">Prowess: ${prowessVal} / ${prowessMax}</span>
        ${isExecutor(actor) ? `<span class="ak5e-specialist-badge">${esc(getDeathmarkStateText(actor))}</span>` : ""}
        ${isHookmaster(actor) ? `<span class="ak5e-specialist-badge ak5e-specialist-badge-hookmaster">${esc(getHookedWeaponStatusText(actor))}</span>` : ""}
        ${isInfuser(actor) ? `<span class="ak5e-specialist-badge ak5e-specialist-badge-infuser">Infuser DC: ${calculateInfuserDC(actor)}</span><span class="ak5e-specialist-badge ak5e-specialist-badge-infuser">${esc(getActiveInfusionsCountText(actor))}</span>` : ""}
        ${isInventor(actor) ? `<span class="ak5e-specialist-badge ak5e-specialist-badge-inventor">${esc(getInventionsBadgeText(actor))}</span><span class="ak5e-specialist-badge ak5e-specialist-badge-inventor">Inventor DC: ${calculateInventorDC(actor)}</span><span class="ak5e-specialist-badge ak5e-specialist-badge-inventor">${esc(getActiveModificationsCountText(actor))}</span>` : ""}
        ${isSkyranger(actor) ? `<span class="ak5e-specialist-badge ak5e-specialist-badge-skyranger">Fuel: ${getFuel(actor)} / ${getFuelMax(actor)}</span><span class="ak5e-specialist-badge ak5e-specialist-badge-skyranger">Doctrine: ${esc(AIR_DOCTRINE_NAMES[actor.flags?.ak5e?.skyranger?.doctrine ?? "airSuperiority"] ?? "Air Superiority")}</span>` : ""}
        ${isDollkeeper(actor) ? `<span class="ak5e-specialist-badge ak5e-specialist-badge-dollkeeper">Doll: ${actor.flags?.ak5e?.dollkeeper?.dollState === "destroyed" ? "Destroyed" : "Active"}</span>${level >= 11 ? `<span class="ak5e-specialist-badge ak5e-specialist-badge-dollkeeper">Mistaken Identity: ${getPool(actor, "mistakenIdentity")?.value ?? 0} / ${getPool(actor, "mistakenIdentity")?.max ?? pbForLevel(level)}</span>` : ""}` : ""}
        ${isTrapmaster(actor) ? `<span class="ak5e-specialist-badge ak5e-specialist-badge-trapmaster">Traps: ${getPool(actor, "traps")?.value ?? 0} / ${getPool(actor, "traps")?.max ?? (2 * pbForLevel(level))}</span><span class="ak5e-specialist-badge ak5e-specialist-badge-trapmaster">Trap DC: ${calculateTrapDC(actor)}</span>` : ""}
      </div>
    </div>
  `);

  if (!profile.configured) {
    sections.push(`
      <div class="ak5e-specialist-unconfigured">
        <p>This character is not yet configured with Specialist class features.</p>
        <button type="button" data-specialist-act="__setup">Grant Core Specialist Features</button>
      </div>
    `);
  } else {
    // Core Specialist Actions
    sections.push(`
      <div class="ak5e-specialist-action-group">
        <h5>Core Specialist Actions</h5>
        <div class="ak5e-button-row">
          <button type="button" data-specialist-cmd="markOfASpecialist">Mark of a Specialist (1 Prowess Reroll)</button>
          <button type="button" data-specialist-cmd="refundMarkOfASpecialist">Refund Mark of a Specialist</button>
          <button type="button" data-specialist-cmd="defensiveStyle">Defensive Style (Reaction +1d4 AC)</button>
        </div>
        ${level >= 12 ? `
          <div class="ak5e-button-row">
            <button type="button" data-specialist-cmd="weaponExpertiseMelee">Weapon Expertise Melee (+1 Dmg Die)</button>
            <button type="button" data-specialist-cmd="weaponExpertiseRanged">Weapon Expertise Ranged (Advantage)</button>
          </div>
        ` : ""}
        ${level >= 17 ? `
          <div class="ak5e-button-row">
            <button type="button" data-specialist-cmd="itsAllSkill">It's All Skill (3 Prowess Save Auto-Success)</button>
          </div>
        ` : ""}
        ${level >= 18 ? `
          <div class="ak5e-button-row">
            <button type="button" data-specialist-cmd="weaponMasteryMelee">Weapon Mastery Melee (+Half Level Dmg)</button>
            <button type="button" data-specialist-cmd="weaponMasteryRanged">Weapon Mastery Ranged (+PB Attack)</button>
          </div>
        ` : ""}
      </div>
    `);

    // Subclass actions placeholder (future milestones)
    if (isExecutor(actor)) {
      const path = getExecutorPath(actor);
      const pathLabel = path === "hunter" ? "Hunter" : path === "bodyguard" ? "Bodyguard" : "Executor";
      sections.push(`
        <div class="ak5e-specialist-action-group">
          <h5>Executor Actions (${pathLabel})</h5>
          <div class="ak5e-button-row">
            <button type="button" data-specialist-cmd="transferDeathmark">Transfer Deathmark</button>
            <button type="button" data-specialist-cmd="recallDeathmark">Recall Deathmark</button>
            ${path === "hunter" && level >= 5 ? `<button type="button" data-specialist-cmd="sweeper">Sweeper (1 Prowess)</button>` : ""}
            ${path === "hunter" && level >= 20 ? `<button type="button" data-specialist-cmd="mortalBlow">Mortal Blow (1/LR, 10d8)</button>` : ""}
            ${path === "bodyguard" ? `<button type="button" data-specialist-cmd="attackRedirection">Attack Redirection (10 ft)</button>` : ""}
            ${path === "bodyguard" && level >= 5 ? `<button type="button" data-specialist-cmd="smokescreen">Smokescreen (1 Prowess Reaction)</button>` : ""}
            ${path === "bodyguard" && level >= 11 ? `<button type="button" data-specialist-cmd="dangersense">Dangersense (Reaction)</button>` : ""}
            ${path === "bodyguard" && level >= 15 ? `<button type="button" data-specialist-cmd="bladeShield">Blade Shield (${level >= 20 ? "Free" : "Reaction"})</button>` : ""}
          </div>
        </div>
      `);
    } else if (isHookmaster(actor)) {
      const hmState = getHookmasterState(actor);
      const hasHook = Boolean(getHookedWeapon(actor));
      const isGrappling = Boolean(hmState.grappledTarget);
      const isWrangling = Boolean(hmState.wranglerTarget);

      sections.push(`
        <div class="ak5e-specialist-action-group">
          <h5>Hookmaster Actions</h5>
          <div class="ak5e-button-row">
            ${!hasHook ? `<button type="button" data-specialist-cmd="convertHookedWeapon">Convert Hooked Weapon</button>` : `<button type="button" data-specialist-cmd="revertHookedWeapon">Revert Hooked Weapon</button>`}
            ${hasHook ? `<button type="button" data-specialist-cmd="bonusActionHookAttack">Bonus Action Hook Attack</button>` : ""}
            ${level >= 5 ? `
              <button type="button" data-specialist-cmd="bigBoot">Big Boot (10 ft Push)</button>
              <button type="button" data-specialist-cmd="kingOfUrbanJungle">King of the Urban Jungle (Fly 2x Range)</button>
              <button type="button" data-specialist-cmd="boundInRope">Bound in Rope (1 Prowess Grapple)</button>
              <button type="button" data-specialist-cmd="wrangler">Wrangler (1 Prowess Latch)</button>
            ` : ""}
            ${isGrappling ? `
              <button type="button" data-specialist-cmd="dragBoundTarget">Drag Bound Target (15 ft)</button>
              <button type="button" data-specialist-cmd="hogtie">Hogtie (Action within 5 ft)</button>
              <button type="button" data-specialist-cmd="releaseGrapple">Release Grapple</button>
            ` : ""}
            ${isWrangling ? `
              <button type="button" data-specialist-cmd="releaseWrangler">Release Wrangler</button>
            ` : ""}
            ${level >= 11 ? `
              <button type="button" data-specialist-cmd="mightyPush">Mighty Push (8d6 & 20 ft Knockback)</button>
            ` : ""}
            ${level >= 15 ? `
              <button type="button" data-specialist-cmd="spidersThread">Spider's Thread (Climb Speed)</button>
              <button type="button" data-specialist-cmd="swingToSafety">Swing to Safety (Falling Reaction)</button>
            ` : ""}
            ${level >= 20 ? `
              <button type="button" data-specialist-cmd="scorpionSting">Scorpion Sting (1/LR, 6 Attacks)</button>
            ` : ""}
          </div>
        </div>
      `);
    } else if (isInfuser(actor)) {
      sections.push(`
        <div class="ak5e-specialist-action-group">
          <h5>Infuser Actions (Infuser DC: ${calculateInfuserDC(actor)})</h5>
          <div class="ak5e-button-row">
            <button type="button" data-specialist-cmd="applyInfusion">Apply Alchemical Infusion (Bonus Action)</button>
            <button type="button" data-specialist-cmd="leverageInfusion">Leverage Active Infusion</button>
            <button type="button" data-specialist-cmd="clearInfusion">Clear Active Infusion</button>
            ${level >= 5 ? `
              <button type="button" data-specialist-cmd="doubleBlindTrial">Double-Blind Trial (BA, 1 Prowess + 1 Infusion -> 1d6 Toxin)</button>
            ` : ""}
            ${level >= 20 ? `
              <button type="button" data-specialist-cmd="toDefyScience">To Defy Science (Action, 1/LR Invulnerability)</button>
            ` : ""}
          </div>
        </div>
      `);
    } else if (isInventor(actor)) {
      const invDC = calculateInventorDC(actor);
      sections.push(`
        <div class="ak5e-specialist-action-group">
          <h5>Inventor Actions (Inventor DC: ${invDC})</h5>
          <div class="ak5e-button-row">
            <button type="button" data-specialist-cmd="applyModification">Apply Equipment Modification</button>
            <button type="button" data-specialist-cmd="removeModification">Remove Equipment Modification</button>
            <button type="button" data-specialist-cmd="activateModification">Activate Modification</button>
            ${level >= 5 ? `
              <button type="button" data-specialist-cmd="mobileModding">Mobile Modding (1 Prowess)</button>
              <button type="button" data-specialist-cmd="strangeContraption">Strange Contraption (1/LR, 30 ft)</button>
            ` : ""}
            ${level >= 20 ? `
              <button type="button" data-specialist-cmd="theBigOne">The Big One (1/LR, FLASH / SHARD / QUASAR)</button>
            ` : ""}
          </div>
        </div>
      `);
    } else if (isSkyranger(actor)) {
      const activeDoctrine = actor.flags?.ak5e?.skyranger?.doctrine ?? "airSuperiority";
      const doctrineLabel = AIR_DOCTRINE_NAMES[activeDoctrine] ?? "Air Superiority";
      sections.push(`
        <div class="ak5e-specialist-action-group">
          <h5>Skyranger Actions (Fuel: ${getFuel(actor)} / ${getFuelMax(actor)})</h5>
          <div class="ak5e-button-row">
            <button type="button" data-specialist-cmd="takeOff">Take Off (1 Fuel, 1 min Fly)</button>
            <button type="button" data-specialist-cmd="selectDoctrine">Select Doctrine (${esc(doctrineLabel)})</button>
            ${level >= 5 ? `
              <button type="button" data-specialist-cmd="aaMissile">AA Missile (100 ft, DEX Save)</button>
              <button type="button" data-specialist-cmd="bombingRun">Bombing Run (15 ft Radius)</button>
              <button type="button" data-specialist-cmd="swoopingDive">Swooping Dive (CAS + Strafe)</button>
              <button type="button" data-specialist-cmd="evasiveManoeuvres">Evasive Manoeuvres (Reaction +PB AC)</button>
            ` : ""}
            ${level >= 15 ? `
              <button type="button" data-specialist-cmd="afterburnersAura">Afterburners Fire Aura (10 ft)</button>
            ` : ""}
            ${level >= 20 ? `
              <button type="button" data-specialist-cmd="activateSkyscreamer">Skyscreamer Combat Mode (1/LR)</button>
            ` : ""}
          </div>
        </div>
      `);
    } else if (isDollkeeper(actor)) {
      sections.push(`
        <div class="ak5e-specialist-action-group">
          <h5>Dollkeeper Actions</h5>
          <div class="ak5e-button-row">
            <button type="button" data-specialist-cmd="commandDoll">Command Doll (Bonus Action)</button>
            ${level >= 5 ? `
              <button type="button" data-specialist-cmd="musicalChairs">Musical Chairs (1 Prowess Swap)</button>
              <button type="button" data-specialist-cmd="marionette">Marionette (Reaction 0 HP Save)</button>
            ` : ""}
            ${level >= 11 ? `
              <button type="button" data-specialist-cmd="mistakenIdentity">Mistaken Identity (Reaction Redirection)</button>
            ` : ""}
            ${level >= 20 ? `
              <button type="button" data-specialist-cmd="dollRaid">Doll Raid (1/LR Simultaneous Turn)</button>
            ` : ""}
          </div>
        </div>
      `);
    } else if (isTrapmaster(actor)) {
      const trapDC = calculateTrapDC(actor);
      sections.push(`
        <div class="ak5e-specialist-action-group">
          <h5>Trapmaster Actions (Trap DC: ${trapDC})</h5>
          <div class="ak5e-button-row">
            <button type="button" data-specialist-cmd="placeTrap">Place Trap (1 Traps Pool)</button>
            <button type="button" data-specialist-cmd="devilsOwnLuck">Devil's Own Luck (Environmental Trap)</button>
            ${level >= 5 ? `
              <button type="button" data-specialist-cmd="heresOneIMadeEarlier">Here's One I Made Earlier (60 ft, 1 Prowess)</button>
              <button type="button" data-specialist-cmd="warningPoint">Warning Point (Reaction Stop Speed)</button>
            ` : ""}
            ${level >= 11 ? `
              <button type="button" data-specialist-cmd="comeAndGetMe">Come and Get Me (60 ft Lure)</button>
            ` : ""}
            ${level >= 20 ? `
              <button type="button" data-specialist-cmd="partyFavours">Party Favours (1/LR, 6 Traps at 100 ft)</button>
            ` : ""}
          </div>
        </div>
      `);
    }

    // Progression and Undo Management
    sections.push(`
      <div class="ak5e-specialist-action-group ak5e-specialist-admin-row">
        <button type="button" data-specialist-act="__progression">Specialist Progression</button>
        <button type="button" data-specialist-act="__undoList">Review / Undo Recent Uses</button>
      </div>
    `);
  }

  // Guidance notes
  sections.push(`
    <div class="ak5e-specialist-notes">
      <p><em>WORKFLOW §3.2: Confirm before use. Warnings emit "Use anyway". Resource shortfalls clamp at 0 and are tracked on receipts.</em></p>
    </div>
  `);

  const content = `<div class="ak5e-specialist-controls-dialog">${sections.join("")}</div>`;

  const DialogClass = globalThis.foundry?.applications?.api?.DialogV2 ?? globalThis.Dialog;
  if (!DialogClass) {
    console.warn("AK5e | No Dialog API available in current environment.");
    return;
  }

  const dlg = new DialogClass({
    window: { title: `${actor.name} — Specialist Controls` },
    position: { width: 560 },
    content,
    buttons: [{ action: "close", label: "Close", default: true }]
  });

  dlg.render(true);

  setTimeout(() => {
    const el = dlg.element;
    if (!el) return;

    el.querySelectorAll("[data-specialist-cmd]").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.preventDefault();
        const cmd = btn.dataset.specialistCmd;
        await handleSpecialistCommand(actor, cmd);
        dlg.close();
      });
    });

    el.querySelectorAll("[data-specialist-act]").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.preventDefault();
        const act = btn.dataset.specialistAct;
        if (act === "__setup") {
          const preview = await previewSpecialistSetup(actor);
          await applySpecialistSetup(actor, { confirmed: true, contextKey: preview.contextKey });
          ui?.notifications?.info?.("Core Specialist features granted.");
          dlg.close();
        } else if (act === "__progression") {
          dlg.close();
          const p = await previewSpecialistProgression(actor);
          await applySpecialistProgression(actor, { confirmed: true, contextKey: p.contextKey });
          ui?.notifications?.info?.("Specialist progression updated.");
        } else if (act === "__undoList") {
          openPlayUndoList(specialistUses, actor);
        }
      });
    });
  }, 50);
}

export async function handleSpecialistCommand(actor, cmd) {
  if (cmd === "markOfASpecialist") {
    return confirmPlayUse("Mark of a Specialist", extra =>
      specialistUses.command(actor, "markOfASpecialist", {
        confirmed: true,
        skill: extra?.skill ?? "acr",
        skillName: extra?.skillName ?? "Acrobatics",
        ...extra
      }, operationId())
    );
  }

  if (cmd === "refundMarkOfASpecialist") {
    return confirmPlayUse("Refund Mark of a Specialist", extra =>
      specialistUses.command(actor, "refundMarkOfASpecialist", {
        confirmed: true,
        ...extra
      }, operationId())
    );
  }

  if (cmd === "defensiveStyle") {
    return confirmPlayUse("Defensive Fighting Style", extra =>
      specialistUses.command(actor, "defensiveStyle", {
        confirmed: true,
        ...extra
      }, operationId())
    );
  }

  if (cmd === "weaponExpertiseMelee") {
    return confirmPlayUse("Weapon Expertise (Melee)", extra =>
      specialistUses.command(actor, "weaponExpertiseMelee", {
        confirmed: true,
        ...extra
      }, operationId())
    );
  }

  if (cmd === "weaponExpertiseRanged") {
    return confirmPlayUse("Weapon Expertise (Ranged)", extra =>
      specialistUses.command(actor, "weaponExpertiseRanged", {
        confirmed: true,
        ...extra
      }, operationId())
    );
  }

  if (cmd === "itsAllSkill") {
    return confirmPlayUse("Falling Upwards: It's All Skill", extra =>
      specialistUses.command(actor, "itsAllSkill", {
        confirmed: true,
        ...extra
      }, operationId())
    );
  }

  if (cmd === "weaponMasteryMelee") {
    return confirmPlayUse("Weapon Mastery (Melee)", extra =>
      specialistUses.command(actor, "weaponMasteryMelee", {
        confirmed: true,
        ...extra
      }, operationId())
    );
  }

  if (cmd === "weaponMasteryRanged") {
    return confirmPlayUse("Weapon Mastery (Ranged)", extra =>
      specialistUses.command(actor, "weaponMasteryRanged", {
        confirmed: true,
        ...extra
      }, operationId())
    );
  }

  if (cmd === "transferDeathmark") {
    const target = Array.from(game.user?.targets ?? [])[0]?.actor;
    return confirmPlayUse("Transfer Deathmark", extra =>
      specialistUses.command(actor, "transferDeathmark", {
        confirmed: true,
        targetUuid: extra?.targetUuid ?? target?.uuid,
        targetName: extra?.targetName ?? target?.name,
        ...extra
      }, operationId())
    );
  }

  if (cmd === "recallDeathmark") {
    return confirmPlayUse("Recall Deathmark", extra =>
      specialistUses.command(actor, "recallDeathmark", {
        confirmed: true,
        ...extra
      }, operationId())
    );
  }

  if (cmd === "sweeper") {
    return confirmPlayUse("Sweeper (1 Prowess)", extra =>
      specialistUses.command(actor, "sweeper", {
        confirmed: true,
        ...extra
      }, operationId())
    );
  }

  if (cmd === "smokescreen") {
    return confirmPlayUse("Smokescreen (1 Prowess Reaction)", extra =>
      specialistUses.command(actor, "smokescreen", {
        confirmed: true,
        ...extra
      }, operationId())
    );
  }

  if (cmd === "mortalBlow") {
    const target = Array.from(game.user?.targets ?? [])[0]?.actor;
    return confirmPlayUse("Mortal Blow (10d8)", extra =>
      specialistUses.command(actor, "mortalBlow", {
        confirmed: true,
        targetUuid: extra?.targetUuid ?? target?.uuid,
        targetName: extra?.targetName ?? target?.name,
        ...extra
      }, operationId())
    );
  }

  if (cmd === "bladeShield") {
    return confirmPlayUse("Blade Shield", extra =>
      specialistUses.command(actor, "bladeShield", {
        confirmed: true,
        ...extra
      }, operationId())
    );
  }

  if (cmd === "attackRedirection") {
    return confirmPlayUse("Attack Redirection", extra =>
      specialistUses.command(actor, "attackRedirection", {
        confirmed: true,
        ...extra
      }, operationId())
    );
  }

  if (cmd === "dangersense") {
    return confirmPlayUse("Dangersense (Reaction)", extra =>
      specialistUses.command(actor, "dangersense", {
        confirmed: true,
        ...extra
      }, operationId())
    );
  }

  if (cmd === "convertHookedWeapon") {
    const items = Array.from(actor.items ?? []).filter(i => i.type === "weapon");
    const convertible = items.filter(i => canConvertWeaponToHook(i).valid);
    const chosenItem = convertible[0] ?? items[0];
    const itemId = chosenItem?.id ?? chosenItem?.uuid;
    return confirmPlayUse(`Convert Hooked Weapon (${chosenItem?.name ?? "Weapon"})`, extra =>
      specialistUses.command(actor, "convertHookedWeapon", {
        confirmed: true,
        itemId,
        ...extra
      }, operationId())
    );
  }

  if (cmd === "applyModification") {
    const modifiable = listItems(actor.items).filter(i => i.type === "weapon" || i.type === "equipment");
    const unmodded = modifiable.find(i => getItemModifications(i).length === 0) ?? modifiable[0];
    const defaultItem = unmodded;
    const existing = defaultItem ? getItemModifications(defaultItem).map(m => m.id) : [];
    const availableMod = ["boom-module", "burning-edge", "shock-engine"].find(id => !existing.includes(id)) ?? "boom-module";
    return confirmPlayUse("Apply Equipment Modification", extra =>
      specialistUses.command(actor, "applyModification", {
        confirmed: true,
        itemId: extra?.itemId ?? defaultItem?.id ?? defaultItem?.uuid,
        modificationId: extra?.modificationId ?? extra?.modId ?? availableMod,
        ...extra
      }, operationId())
    );
  }

  if (cmd === "removeModification") {
    const modified = listItems(actor.items).find(i => getItemModifications(i).length > 0);
    const defaultMod = modified ? getItemModifications(modified)[0]?.id : null;
    return confirmPlayUse("Remove Equipment Modification", extra =>
      specialistUses.command(actor, "removeModification", {
        confirmed: true,
        itemId: extra?.itemId ?? modified?.id ?? modified?.uuid,
        modificationId: extra?.modificationId ?? extra?.modId ?? defaultMod,
        ...extra
      }, operationId())
    );
  }

  if (cmd === "activateModification") {
    const modified = listItems(actor.items).find(i => getItemModifications(i).length > 0);
    const defaultMod = modified ? getItemModifications(modified)[0]?.id : null;
    return confirmPlayUse("Activate Modification", extra =>
      specialistUses.command(actor, "activateModification", {
        confirmed: true,
        itemId: extra?.itemId ?? modified?.id ?? modified?.uuid,
        modificationId: extra?.modificationId ?? extra?.modId ?? defaultMod,
        ...extra
      }, operationId())
    );
  }

  if (cmd === "mobileModding") {
    const target = Array.from(game.user?.targets ?? [])[0]?.actor ?? actor;
    const modifiable = listItems(target.items).filter(i => i.type === "weapon" || i.type === "equipment");
    const defaultItem = modifiable[0];
    return confirmPlayUse("Mobile Modding", extra =>
      specialistUses.command(actor, "mobileModding", {
        confirmed: true,
        targetUuid: extra?.targetUuid ?? target.uuid,
        targetName: extra?.targetName ?? target.name,
        itemId: extra?.itemId ?? defaultItem?.id ?? defaultItem?.uuid,
        modificationId: extra?.modificationId ?? extra?.modId ?? "boom-module",
        ...extra
      }, operationId())
    );
  }

  if (cmd === "strangeContraption") {
    return confirmPlayUse("Strange Contraption", extra =>
      specialistUses.command(actor, "strangeContraption", {
        confirmed: true,
        contraptionId: extra?.contraptionId ?? "flashlight",
        ...extra
      }, operationId())
    );
  }

  if (cmd === "theBigOne") {
    return confirmPlayUse("The Big One", extra =>
      specialistUses.command(actor, "theBigOne", {
        confirmed: true,
        mode: extra?.mode ?? "FLASH",
        ...extra
      }, operationId())
    );
  }

  if (cmd === "takeOff") {
    return confirmPlayUse("Take Off (1 Fuel)", extra =>
      specialistUses.command(actor, "takeOff", { confirmed: true, ...extra }, operationId())
    );
  }

  if (cmd === "selectDoctrine") {
    return confirmPlayUse("Select Air Doctrine", extra =>
      specialistUses.command(actor, "selectDoctrine", { confirmed: true, doctrine: extra?.doctrine ?? "airSuperiority", ...extra }, operationId())
    );
  }

  if (cmd === "aaMissile") {
    return confirmPlayUse("AA Missile (100 ft)", extra =>
      specialistUses.command(actor, "aaMissile", { confirmed: true, targetUuid, targetName, ...extra }, operationId())
    );
  }

  if (cmd === "bombingRun") {
    return confirmPlayUse("Bombing Run", extra =>
      specialistUses.command(actor, "bombingRun", { confirmed: true, mode: extra?.mode ?? "standard", ...extra }, operationId())
    );
  }

  if (cmd === "swoopingDive") {
    return confirmPlayUse("Swooping Dive", extra =>
      specialistUses.command(actor, "swoopingDive", { confirmed: true, targetUuid, targetName, ...extra }, operationId())
    );
  }

  if (cmd === "evasiveManoeuvres") {
    return confirmPlayUse("Evasive Manoeuvres", extra =>
      specialistUses.command(actor, "evasiveManoeuvres", { confirmed: true, ...extra }, operationId())
    );
  }

  if (cmd === "afterburnersAura") {
    return confirmPlayUse("Afterburners Fire Aura", extra =>
      specialistUses.command(actor, "afterburnersAura", { confirmed: true, targetUuid, targetName, ...extra }, operationId())
    );
  }

  if (cmd === "activateSkyscreamer") {
    return confirmPlayUse("Activate Skyscreamer (1/LR)", extra =>
      specialistUses.command(actor, "activateSkyscreamer", { confirmed: true, ...extra }, operationId())
    );
  }

  if (cmd === "commandDoll") {
    return confirmPlayUse("Command Doll", extra =>
      specialistUses.command(actor, "commandDoll", { confirmed: true, command: extra?.command ?? "strike", targetUuid, targetName, ...extra }, operationId())
    );
  }

  if (cmd === "musicalChairs") {
    return confirmPlayUse("Musical Chairs (1 Prowess)", extra =>
      specialistUses.command(actor, "musicalChairs", { confirmed: true, ...extra }, operationId())
    );
  }

  if (cmd === "marionette") {
    return confirmPlayUse("Marionette (0 HP Save)", extra =>
      specialistUses.command(actor, "marionette", { confirmed: true, ...extra }, operationId())
    );
  }

  if (cmd === "mistakenIdentity") {
    return confirmPlayUse("Mistaken Identity", extra =>
      specialistUses.command(actor, "mistakenIdentity", { confirmed: true, attackerUuid: targetUuid, ...extra }, operationId())
    );
  }

  if (cmd === "dollRaid") {
    return confirmPlayUse("Doll Raid (1/LR)", extra =>
      specialistUses.command(actor, "dollRaid", { confirmed: true, targetUuid, targetName, ...extra }, operationId())
    );
  }

  if (cmd === "placeTrap") {
    return confirmPlayUse("Place Trap", extra =>
      specialistUses.command(actor, "placeTrap", { confirmed: true, trapId: extra?.trapId ?? "explosive", ...extra }, operationId())
    );
  }

  if (cmd === "devilsOwnLuck") {
    return confirmPlayUse("Devil's Own Luck", extra =>
      specialistUses.command(actor, "devilsOwnLuck", { confirmed: true, trapId: extra?.trapId ?? "explosive", ...extra }, operationId())
    );
  }

  if (cmd === "heresOneIMadeEarlier") {
    return confirmPlayUse("Here's One I Made Earlier (60 ft)", extra =>
      specialistUses.command(actor, "heresOneIMadeEarlier", { confirmed: true, trapId: extra?.trapId ?? "explosive", ...extra }, operationId())
    );
  }

  if (cmd === "warningPoint") {
    return confirmPlayUse("Warning Point", extra =>
      specialistUses.command(actor, "warningPoint", { confirmed: true, targetUuid, targetName, ...extra }, operationId())
    );
  }

  if (cmd === "comeAndGetMe") {
    return confirmPlayUse("Come and Get Me", extra =>
      specialistUses.command(actor, "comeAndGetMe", { confirmed: true, targetUuid, targetName, ...extra }, operationId())
    );
  }

  if (cmd === "partyFavours") {
    return confirmPlayUse("Party Favours (1/LR, 6 Traps)", extra =>
      specialistUses.command(actor, "partyFavours", { confirmed: true, ...extra }, operationId())
    );
  }

  const primaryTarget = globalThis.game?.user?.targets ? Array.from(globalThis.game.user.targets)[0] : null;
  const targetUuid = primaryTarget?.actor?.uuid ?? primaryTarget?.uuid ?? null;
  const targetName = primaryTarget?.name ?? "Target";

  if (["bigBoot", "boundInRope", "dragBoundTarget", "hogtie", "wrangler", "mightyPush", "scorpionSting", "bonusActionHookAttack", "applyInfusion", "leverageInfusion", "clearInfusion", "toDefyScience"].includes(cmd)) {
    return confirmPlayUse(cmd, extra =>
      specialistUses.command(actor, cmd, {
        confirmed: true,
        targetUuid,
        targetName,
        ...extra
      }, operationId())
    );
  }

  return confirmPlayUse(cmd, extra =>
    specialistUses.command(actor, cmd, { confirmed: true, ...extra }, operationId())
  );
}

export function renderSpecialistControls(app, element) {
  const actor = actorFor(app);
  if (!eligible(actor) || (!actor.isOwner && !game.user?.isGM)) return;

  const roots = app.element?.contains(element) ? [app.element] : [element];
  for (const root of roots) {
    for (const old of root.querySelectorAll(".ak5e-specialist-sheet-panel")) old.remove();
    const features = root.matches?.('.tab[data-tab="features"]') ? root : root.querySelector('.tab[data-tab="features"]');
    if (!features) continue;

    const profile = specialistProfile(actor);
    const panel = node("section", null, "ak5e-specialist-sheet-panel");
    panel.append(node("h3", "Specialist"));

    if (profile.configured) {
      const badgesContainer = node("div", null, "ak5e-specialist-summary ak5e-specialist-badges");

      // Prowess Badge
      const prowessText = getProwessBadgeText(actor, profile);
      badgesContainer.append(node("span", prowessText, "ak5e-specialist-badge ak5e-specialist-badge-prowess"));

      // Subclass Badge
      if (isExecutor(actor)) {
        badgesContainer.append(node("span", getDeathmarkStateText(actor), "ak5e-specialist-badge ak5e-specialist-badge-subclass ak5e-specialist-badge-deathmark"));
      } else if (isHookmaster(actor)) {
        badgesContainer.append(node("span", getHookedWeaponStatusText(actor), "ak5e-specialist-badge ak5e-specialist-badge-subclass ak5e-specialist-badge-hook ak5e-specialist-badge-hookmaster"));
      } else if (isInfuser(actor)) {
        badgesContainer.append(node("span", `Infuser DC: ${calculateInfuserDC(actor)}`, "ak5e-specialist-badge ak5e-specialist-badge-subclass ak5e-specialist-badge-infuser ak5e-specialist-badge-infuser-dc"));
        badgesContainer.append(node("span", getActiveInfusionsCountText(actor), "ak5e-specialist-badge ak5e-specialist-badge-subclass ak5e-specialist-badge-infusions ak5e-specialist-badge-infuser"));
      } else if (isInventor(actor)) {
        badgesContainer.append(node("span", getInventionsBadgeText(actor), "ak5e-specialist-badge ak5e-specialist-badge-subclass ak5e-specialist-badge-inventor ak5e-specialist-badge-inventions"));
        badgesContainer.append(node("span", `Inventor DC: ${calculateInventorDC(actor)}`, "ak5e-specialist-badge ak5e-specialist-badge-subclass ak5e-specialist-badge-inventor ak5e-specialist-badge-inventor-dc"));
        badgesContainer.append(node("span", getActiveModificationsCountText(actor), "ak5e-specialist-badge ak5e-specialist-badge-subclass ak5e-specialist-badge-inventor ak5e-specialist-badge-mod-count"));
      } else if (isSkyranger(actor)) {
        badgesContainer.append(node("span", `Fuel: ${getFuel(actor)} / ${getFuelMax(actor)}`, "ak5e-specialist-badge ak5e-specialist-badge-subclass ak5e-specialist-badge-skyranger ak5e-specialist-badge-fuel"));
        badgesContainer.append(node("span", `Doctrine: ${AIR_DOCTRINE_NAMES[actor.flags?.ak5e?.skyranger?.doctrine ?? "airSuperiority"] ?? "Air Superiority"}`, "ak5e-specialist-badge ak5e-specialist-badge-subclass ak5e-specialist-badge-skyranger ak5e-specialist-badge-doctrine"));
      } else if (isDollkeeper(actor)) {
        badgesContainer.append(node("span", `Doll: ${actor.flags?.ak5e?.dollkeeper?.dollState === "destroyed" ? "Destroyed" : "Active"}`, "ak5e-specialist-badge ak5e-specialist-badge-subclass ak5e-specialist-badge-dollkeeper ak5e-specialist-badge-doll"));
        if (profile.level >= 11) {
          badgesContainer.append(node("span", `Mistaken Identity: ${getPool(actor, "mistakenIdentity")?.value ?? 0} / ${getPool(actor, "mistakenIdentity")?.max ?? pbForLevel(profile.level)}`, "ak5e-specialist-badge ak5e-specialist-badge-subclass ak5e-specialist-badge-dollkeeper ak5e-specialist-badge-mistaken-identity"));
        }
      } else if (isTrapmaster(actor)) {
        badgesContainer.append(node("span", `Traps: ${getPool(actor, "traps")?.value ?? 0} / ${getPool(actor, "traps")?.max ?? (2 * pbForLevel(profile.level))}`, "ak5e-specialist-badge ak5e-specialist-badge-subclass ak5e-specialist-badge-trapmaster ak5e-specialist-badge-traps"));
        badgesContainer.append(node("span", `Trap DC: ${calculateTrapDC(actor)}`, "ak5e-specialist-badge ak5e-specialist-badge-subclass ak5e-specialist-badge-trapmaster ak5e-specialist-badge-trap-dc"));
      } else if (profile.branch) {
        const scName = profile.branch.charAt(0).toUpperCase() + profile.branch.slice(1);
        badgesContainer.append(node("span", `Subclass: ${scName}`, "ak5e-specialist-badge ak5e-specialist-badge-subclass"));
      }

      panel.append(badgesContainer);
    }

    if (actor.isOwner || game.user?.isGM) {
      panel.append(
        button(profile.configured ? "Open Specialist Controls" : "Set up Specialist", () => openSpecialistControls(actor), "ak5e-specialist-controls-btn")
      );
    }

    panel.append(node("p", "Opening this panel makes no changes (confirm before use).", "ak5e-specialist-note"));
    features.prepend(panel);
  }
}

export function registerSpecialistSheetHooks() {
  if (installed) return;
  installed = true;

  if (globalThis.Hooks?.on) {
    Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
      const actor = actorFor(app);
      if (!eligible(actor) || !actor.isOwner || controls.some(c => c.action === "ak5eSpecialist")) return;
      controls.unshift({
        action: "ak5eSpecialist",
        icon: "fa-solid fa-crosshairs",
        label: "Specialist",
        ownership: "OWNER",
        onClick: () => safe(() => openSpecialistControls(actor))
      });
    });

    Hooks.on("getActorSheetHeaderButtons", (app, buttons) => {
      const actor = actorFor(app);
      if (!eligible(actor) || !actor.isOwner || buttons.some(b => b.class === "ak5e-specialist-header-btn")) return;
      buttons.unshift({
        label: "Specialist",
        class: "ak5e-specialist-header-btn",
        icon: "fa-solid fa-crosshairs",
        onclick: () => safe(() => openSpecialistControls(actor))
      });
    });

    Hooks.on("renderActorSheetV2", renderSpecialistControls);
    Hooks.on("renderChatMessageHTML", (message, html) => {
      try {
        renderPlayUseCard(specialistUses, message, html);
      } catch (error) {
        console.error("AK5e | Specialist use card", error);
      }
    });
  }
}
