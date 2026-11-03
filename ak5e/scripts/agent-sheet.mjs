import { registerVanguardExtension } from './vanguard-extensions.mjs';
import { vanguardLevel } from './vanguard-rules.mjs';
import { initializeAgent, agentState, trackAgentActor, agentLevelRuling } from './agent-features.mjs';

const id = 'subclass-vanguard-agent';
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const option = (value, label) => `<option value="${esc(value)}">${esc(label)}</option>`;
const isSnapshot = context => context.purpose === 'controls';
const choice = async (title, content, read) => {
  const result = await foundry.applications.api.DialogV2.wait({ window: { title }, position: { width: 560 }, rejectClose: false, content,
    buttons: [{ action: 'continue', label: 'Review use', callback: (_event, button) => {
      if (button.form.reportValidity && !button.form.reportValidity()) return false;
      return read(button.form);
    } }, { action: 'cancel', label: 'Cancel', default: true, callback: () => null }] });
  return result && typeof result === 'object' ? result : null;
};
const targetOptions = () => [...(game.user?.targets ?? [])].filter(token => token.actor?.uuid).map(token => option(token.actor.uuid, token.name ?? token.actor.name)).join('');
const targetField = (required = true) => `<label>Target <select name="targetUuid" ${required ? 'required' : ''}><option value="">Select a targeted creature</option>${targetOptions()}</select></label>`;
// Second Strike only: the source never defines "Agent Level", so it stays a public per-use choice
// unless a recorded GM ruling applies, in which case the prompt is skipped and the ruling is used.
const levelField = actor => agentLevelRuling(actor) !== undefined
  ? '<p>A recorded GM ruling defines Agent Level for this feature; it is applied automatically.</p>'
  : `<label>Agent Level for this use (choose your reading) <input name="agentLevel" type="number" min="1" max="20" step="1" required value="${esc(vanguardLevel(actor) ?? 1)}"></label>`;
const levelRead = form => form.elements.agentLevel ? { agentLevel: Number(form.elements.agentLevel.value) } : {};
const defenseFields = '<details><summary>Optional table-reviewed damage details</summary><p>Multiple applicable DR sources offer a public choice at confirmation. You may instead supply a reviewed DR total for this use, before adjustments and Corroded. Leave blank to use equipped DR.</p><label>Reviewed DR total <input name="reviewedDR" type="number" min="0" step="1"></label><p>Only select damage properties the table applies to this feature damage; none are assigned automatically.</p><label><input name="mgc" type="checkbox"> Magical</label><label><input name="sil" type="checkbox"> Silvered</label><label><input name="ada" type="checkbox"> Adamantine</label></details>';
const defenseRead = form => ({ ...(form.elements.reviewedDR.value === '' ? {} : { reviewedDR: Number(form.elements.reviewedDR.value) }), damageProperties: ['mgc', 'sil', 'ada'].filter(key => form.elements[key].checked) });

export function registerAgentVanguardExtension() {
  registerVanguardExtension(id, {
    progressionContribution(c) {
      if (c.branchId !== id) return null;
      return { branchId: id, proficiencies: c.level >= 13 ? { tools: [{ key: 'ak5emechanismkit', minimum: 1 }] } : {},
        features: ['Strike from the Shadows', 'Secret Agent', ...(c.level >= 4 ? ['Surgical Strike'] : []), ...(c.level >= 10 ? ['Closing the Case'] : []), ...(c.level >= 13 ? ['Consummate Professional: Mechanism Kit proficiency and unlimited virtual access'] : []), ...(c.level >= 17 ? ['Smoke and Mirrors'] : [])] };
    },
    ownerControls(c) {
      if (c.branchId !== id) return [];
      trackAgentActor(c.actor);
      if (c.actor.isOwner) void initializeAgent(c.actor);
      const controls = [
        { id: `${id}:shadowstrike`, label: 'Strike from the Shadows', hint: 'Quicklaunch: draw a different Thrown weapon. Shadowstrike: Invisible at Attack Action start grants one additional attack and Tip of the Spear on each hit.', command: 'agentShadowstrike',
          prepare: async x => isSnapshot(x) ? { invisibleAtActionStart: false, guidance: 'Choose whether Invisible at Attack Action start.' } : choice('Shadowstrike', '<p>Quicklaunch: draw a different Thrown weapon during an attack with a Thrown weapon. Shadowstrike: make one additional attack as part of the Attack Action; each hit offers Tip of the Spear with no action.</p><label><input type="checkbox" name="invisible"> I was Invisible when this Attack Action began</label>', f => ({ invisibleAtActionStart: f.elements.invisible.checked })) },
        { id: `${id}:expertise`, label: 'Secret Agent: Expertise', hint: 'Choose one proficient Skill.', command: 'agentExpertise',
          prepare: async x => { const options = Object.entries(x.actor.system.skills ?? {}).sort(([,a], [,b]) => (Number(b.value) === 1) - (Number(a.value) === 1)).map(([skillId, v]) => ({ skillId, proficient: Number(v.value) === 1 })); const base = { expertiseChoice: { count: 1, options } }; if (isSnapshot(x)) return base; return choice('Secret Agent Expertise', `<p>Choose one proficient skill (an unproficient skill is warned about and may be used anyway).</p><label>Skill <select name="skillId" required><option value="">Choose</option>${options.map(o => option(o.skillId, o.proficient ? o.skillId : `${o.skillId} (not proficient)`)).join('')}</select></label>`, f => ({ ...base, skillId: f.elements.skillId.value })); } },
        { id: `${id}:fade`, label: 'Secret Agent: Fade', hint: 'Bonus Action; Invisible until end of next Turn. Ends on attack or forced save.', command: 'agentFade',
          prepare: async x => { const base = { inDarkness: false, expiry: 'endOfNextTurn', guidance: 'Darkness costs no use; Proficiency Bonus uses per Long Rest. Choose turn expiry reading; manually end when forcing a save.' }; if (isSnapshot(x)) return base; return choice('Fade', `<p>Bonus Action. Invisible until the end of your next Turn; ends early on an Attack Roll or when you force a save. Use End Fade after you force a save. You have Proficiency Bonus uses per Long Rest; Darkness costs no use.</p><label><input type="checkbox" name="darkness"> In Darkness</label><label>Expiry tracking <select name="expiry">${option('endOfNextTurn', 'End of next turn (tracked)')}${option('manual', 'Confirm expiry manually')}</select></label>`, f => ({ ...base, inDarkness: f.elements.darkness.checked, expiry: f.elements.expiry.value })); } },
        { id: `${id}:endfade`, label: 'End Fade', hint: 'Use after forcing a saving throw or to end manually.', command: 'agentEndFade', prepare: async () => ({}) }
      ];
      if (c.level >= 4) controls.push({ id: `${id}:surgical`, label: 'Surgical Strike', hint: 'Pay it Forward once per Turn after a ranged Thrown hit: move half Speed. Second Strike: next melee attack against that creature, same target; choose Agent Level damage reading.', command: 'agentSurgical',
        prepare: async x => { const base = { targetUuid: x.targetUuid, benefit: 'payItForward', guidance: 'Choose benefit and Agent Level reading.' }; if (isSnapshot(x)) return base; return choice('Surgical Strike', `<p>Pay it Forward: move up to half Speed once per Turn after a ranged Thrown weapon hit. Second Strike: add the chosen Agent Level to the next melee attack against that creature this Turn.</p><label>Benefit <select name="benefit">${option('payItForward','Pay it Forward')}${option('secondStrike','Second Strike')}</select></label>${targetField(false)}${levelField(x.actor)}`, f => ({ ...base, benefit: f.elements.benefit.value, targetUuid: f.elements.targetUuid.value, ...levelRead(f) })); } });
      if (c.level >= 10) controls.push({ id: `${id}:case`, label: 'Closing the Case', hint: 'Bonus Action; choose a visible creature within 30 feet after Shadowstrike.', command: 'agentCase',
        prepare: async x => { const level = vanguardLevel(x.actor) ?? x.level ?? 1; const make = (targetUuid, extra = {}) => { const count = agentState(x.actor).hits.find(hit => hit.uuid === targetUuid)?.count ?? 0; return { targetUuid, qualifyingHitCount: count, damageFormula: `${count * (level >= 14 ? 2 : 1)}d8`, guidance: 'Damage is 1d8 per qualifying hit, or 2d8 at Vanguard level 14 or higher; Shadowstrike required this Turn; count qualifying hits against the visible target within 30 feet.', ...extra }; }; if (isSnapshot(x)) return make(x.targetUuid, { targetVisible: x.targetVisible, targetDistanceFeet: x.targetDistanceFeet, reviewedDR: x.reviewedDR, damageProperties: x.damageProperties }); return choice('Closing the Case', `<p>Choose a creature you can see within 30 feet after Shadowstrike this Turn. Damage is based on qualifying hits against that creature. Damage scales with your Vanguard level (1d8 per hit, 2d8 at level 14).</p>${targetField()}<label><input type="checkbox" name="visible"> Target is visible</label><label>Distance in feet <input type="number" name="distance" min="0" required></label>${defenseFields}`, f => make(f.elements.targetUuid.value, { targetVisible: f.elements.visible.checked, targetDistanceFeet: Number(f.elements.distance.value), ...defenseRead(f) })); } });
      if (c.level >= 13) controls.push({ id: `${id}:professional`, label: 'Consummate Professional', hint: 'Mechanism Kit proficiency; always considered to have unlimited virtual charges.', command: 'agentProfessional', prepare: async () => ({ guidance: 'Mechanism Kit proficiency and unlimited virtual access.' }) });
      controls.push({ id: `${id}:smoke`, label: 'Smoke and Mirrors', hint: 'Level 17: 10 foot magical Darkness sphere; Short Rest.', command: 'agentSmoke',
        prepare: async x => { const base = { timing: 'turn', guidance: '10 foot sphere centered on self; see through it. Choose during your Turn or Reaction timing. Recover on Short Rest; kill reducing a creature to 0 HP grants a free use.' }; if (isSnapshot(x)) return base; return choice('Smoke and Mirrors', `<p>Create a 10-foot sphere of magical Darkness centered on yourself until the start of your next Turn; you can see through it. Place the sphere manually. Recovers after a Short Rest; reducing a creature to 0 HP can allow a free use.</p><label>Timing <select name="timing">${option('turn','During your Turn, no action')}${option('reaction','Reaction')}</select></label><label><input type="checkbox" name="kill" ${agentState(x.actor).smoke.freeKillUseAvailable ? 'checked' : ''}> Use an available kill exemption</label>`, f => ({ ...base, timing: f.elements.timing.value, useKillExemption: f.elements.kill.checked })); } });
      return controls.map(control => ({ ...control, kind: 'use' }));
    }
  });
}
