/** Charger contributions to the Vanguard progression and owner controls. C3:8297-8375. */
import { registerVanguardExtension } from './vanguard-extensions.mjs';
import { vanguardUses } from './vanguard-uses.mjs';
import { CHAPTER_FOUR_EQUIPMENT } from './chapter-four-content.mjs';
import { esc, values, opaqueKey, need } from './operation-kernel.mjs';
import { CHARGER_TIP_GRANT_KIND } from './charger-features.mjs';

const CHARGER_BRANCHES = ['charger', 'subclass-vanguard-charger'];
const live = receipt => receipt && receipt.status !== 'undone';
const option = (value, label, details = {}) => ({ value, label, ...details });
const field = (key, label, options, count = 1, selected = null, requiredAt = 1) => ({ key, label, options, count, selected, requiredAt });
const selectedTarget = () => values(globalThis.game?.user?.targets)[0]?.actor ?? null;
const latest = (actor, command) => vanguardUses.state(actor).undo.filter(entry => entry.command === command && live(entry)).at(-1) ?? null;

async function choose(title, content, callback) {
  return foundry.applications.api.DialogV2.wait({ window: { title }, rejectClose: false, content,
    buttons: [{ action: 'continue', label: 'Continue', callback: (_event, button) => callback(button.form) },
      { action: 'cancel', label: 'Cancel', callback: () => null }] });
}

/**
 * Non-interactive: the most recent live Momentous Strike (the one with a recorded native damage roll when there is one)
 * and the targeted creature are offered to the plan, which warns (never blocks) if they do not fit.
 */
function geirskogulPrepare({ actor }) {
  const strikes = vanguardUses.state(actor).undo.filter(entry => entry.command === 'chargerMomentousStrike' && live(entry));
  const withDamage = strikes.filter(strike => vanguardUses.state(actor).undo.some(entry => entry.parentUseId === strike.id && entry.command === 'chargerStrikeDamage' && live(entry)));
  const strike = withDamage.at(-1) ?? strikes.at(-1) ?? null;
  const damage = strike && vanguardUses.state(actor).undo.find(entry => entry.parentUseId === strike.id && entry.command === 'chargerStrikeDamage' && live(entry));
  const target = selectedTarget();
  const data = {};
  if (strike) data.strikeId = strike.id;
  const targetUuid = target?.uuid ?? damage?.result?.targetUuid;
  if (targetUuid) { data.targetUuid = targetUuid; if (target?.name) data.targetName = target.name; }
  return data;
}

/** Guided collision step after a Geirskögul: the owner names what was crashed into; nothing is rolled or applied. */
export async function openChargerCollision({ actor }) {
  need(actor?.isOwner, 'Choose an owned Charger.');
  const geirskogul = latest(actor, 'chargerGeirskogul');
  need(geirskogul, 'Use Geirskögul first.');
  const target = selectedTarget();
  const choices = await choose('Geirskögul: collision',
    `<p>The pushed Creature crashes into another Creature or an Object. A Creature makes a Dexterity Saving Throw against DC ${esc(geirskogul.result?.dc ?? '?')} (an ally automatically succeeds). On a crash both take Bludgeoning damage equal to half the damage dealt by the triggering Strike. Nothing is rolled or applied for you.</p>
     <label>Crashed into <select name="kind"><option value="creature">A Creature</option><option value="object">An Object</option></select></label>
     <p>Targeted Creature: ${esc(target?.name ?? 'none (target it first for a Creature)')}</p>
     <label><input type="checkbox" name="ally"> It is an ally (automatically succeeds the save)</label>
     <label>Damage the Strike actually dealt, if you want to use that instead of the rolled total <input type="number" name="dealt" min="0" step="1"></label>`,
    form => ({ kind: form.elements.kind.value, ally: form.elements.ally.checked, dealt: form.elements.dealt.value === '' ? undefined : Number(form.elements.dealt.value) }));
  if (!choices) return null;
  need(choices.kind === 'object' || target, 'Target the Creature that was crashed into.');
  const { confirmPlayUse } = await import('./play-uses-sheet.mjs');
  const id = `charger-collision-${foundry.utils.randomID()}`;
  return confirmPlayUse('Geirskögul: collision', extra => vanguardUses.command(actor, 'chargerGeirskogulCollision', {
    ...extra, geirskogulId: geirskogul.id, kind: choices.kind, ally: choices.ally, otherUuid: target?.uuid, otherName: target?.name,
    ...(choices.dealt === undefined ? {} : { dealtDamage: choices.dealt }) }, id), { preview: () => vanguardUses.preview(actor, 'chargerGeirskogulCollision', { geirskogulId: geirskogul.id, kind: choices.kind, ally: choices.ally, otherUuid: target?.uuid, otherName: target?.name }) });
}

/** A kill of a Marked creature offers one Tip of the Spear use; the shared Tip flow validates and records it. */
export async function openChargerMarkTip({ actor }) {
  need(actor?.isOwner, 'Choose an owned Charger.');
  const flagged = Object.values(actor.flags?.ak5e?.charger?.tipOpportunities ?? {}).filter(entry => entry?.status === 'available' && typeof entry.eventId === 'string');
  const open = flagged.filter(entry => !vanguardUses.uses(actor).some(use => use.command === 'tipOfTheSpear' && use.status !== 'undone'
    && use.data?.grantKind === CHARGER_TIP_GRANT_KIND && use.data?.sourceEventId === entry.eventId));
  if (!open.length) { globalThis.ui?.notifications?.warn?.('No Marked creature has been reduced to 0 Hit Points this Turn. Mark one by damaging it, then reduce it to 0 Hit Points.'); return null; }
  let pick = open[0];
  if (open.length > 1) {
    const eventId = await choose('Mark for Elimination: Tip of the Spear',
      `<label>Marked creature reduced to 0 Hit Points <select name="event">${open.map(entry => `<option value="${esc(entry.eventId)}">${esc(globalThis.fromUuidSync?.(entry.targetUuid)?.name ?? entry.targetUuid)}</option>`).join('')}</select></label>`, form => form.elements.event.value);
    pick = open.find(entry => entry.eventId === eventId);
  }
  if (!pick) return null;
  const { chooseTipTarget, useGrantedTip } = await import('./vanguard-sheet.mjs');
  const target = await chooseTipTarget(actor, 'Mark for Elimination: Tip of the Spear');
  if (!target) return null;
  return useGrantedTip(actor, target, `charger-tip-${opaqueKey(pick.eventId)}`, { grantKind: CHARGER_TIP_GRANT_KIND, sourceEventId: pick.eventId, grantIndex: 1 });
}

const heavyMelee = () => CHAPTER_FOUR_EQUIPMENT.filter(entry => entry.kind === 'weapon' && entry.tableData?.category === 'Heavy Melee Weapons');

export function registerChargerVanguardExtension() {
  registerVanguardExtension('charger', {
    progressionContribution(context) {
      if (!CHARGER_BRANCHES.includes(context.branchId)) return null;
      const contribution = { proficiencies: { weaponCategories: ['Heavy Melee'] } };
      const choices = context.branchChoices ?? {};
      if (context.phase === 'fields' && context.choices?.startingEquipment?.mode === 'items') {
        const prefix = `branches.${context.branchId}`;
        contribution.fields = [
          field(`${prefix}.exchangeSlot`, 'Equipment Exchange: exchange 1x Light Melee Weapon or 1x Light Shield from your Starting Equipment for 1x Heavy Melee Weapon (or keep it)',
            [option('keep', 'Keep it'), option('weapon1', 'Exchange the first Light Melee Weapon'), option('weapon2', 'Exchange the second Light Melee Weapon or Light Shield')], 1, choices.exchangeSlot ?? null),
          field(`${prefix}.exchangeWeapon`, 'Equipment Exchange: Heavy Melee Weapon received',
            heavyMelee().map(entry => option(entry.id, entry.name, { sourceId: entry.id })), 1, choices.exchangeWeapon ?? null)
        ];
      }
      if (['weapon1', 'weapon2'].includes(choices.exchangeSlot) && heavyMelee().some(entry => entry.id === choices.exchangeWeapon)) {
        contribution.equipmentExchange = { slot: choices.exchangeSlot, sourceId: choices.exchangeWeapon };
      }
      return contribution;
    },
    ownerControls(context) {
      if (!CHARGER_BRANCHES.includes(context.branchId)) return [];
      const controls = [
        { id: 'charger:couch', kind: 'use', command: 'chargerCouch', label: 'Couch' },
        { id: 'charger:strike', kind: 'use', command: 'chargerMomentousStrike', label: 'Momentous Strike' },
        { id: 'charger:mark-tip', kind: 'dialog', label: 'Tip of the Spear (Marked kill)', open: openChargerMarkTip }
      ];
      if (context.level >= 4) controls.push({ id: 'charger:push-on-through', kind: 'use', command: 'chargerPushOnThrough', label: 'Push on Through' }, { id: 'charger:push', kind: 'use', command: 'chargerPushOnThrough', label: 'Push on Through' });
      if (context.level >= 17) controls.push(
        { id: 'charger:geirskogul', kind: 'use', command: 'chargerGeirskogul', label: 'Geirskögul', prepare: geirskogulPrepare },
        { id: 'charger:geirskogul-collision', kind: 'dialog', label: 'Geirskögul collision', open: openChargerCollision });
      return controls;
    }
  });
}
