/** Mech follow-ups in the disposable standard-test World. Pages come from launchTestBrowser(). */
export async function casterMechFollowupChecks({ gm, player, ids, report, screenshot }) {
  await player.evaluate(id => { void game.ak5e.caster.open(game.actors.get(id)); }, ids.actors.mech);
  const controls = player.locator("dialog:has(.ak5e-caster-panel)").last();
  await controls.waitFor();
  const before = await player.evaluate(id => JSON.stringify(game.actors.get(id).flags.ak5e.caster), ids.actors.mech);
  await controls.locator('[data-caster-ui="createDrone"]').click();
  const creation = player.locator('dialog:has(select[name="mode"])').last();
  await creation.waitFor();
  await screenshot(player, "owner-create-drone-cancel");
  await creation.locator('button[data-action="cancel"]').click();
  if (await player.evaluate(id => JSON.stringify(game.actors.get(id).flags.ak5e.caster), ids.actors.mech) !== before)
    throw new Error("Cancelling Arts Master creation changed Caster state.");
  await controls.locator('button[data-action="close"]').click();

  report.mech.droneUndo = await player.evaluate(async ({ actorId, sceneId, suffix }) => {
    const actor = game.actors.get(actorId), api = game.ak5e.caster;
    const { previewUndo } = await import("/modules/ak5e/scripts/caster-primal-splash.mjs");
    const oldLinks = [...actor.flags.ak5e.caster.drones];
    const create = async (key, x) => {
      const operationId = `${suffix}_${key}`;
      await api.requestDrone(actor, "create", { operationId, confirmed: true, sceneId, x, y: 650, overrides: ["cap"] });
      const drone = game.actors.find(doc => doc.flags.ak5e?.artsMaster?.operationId === operationId);
      if (!drone) throw new Error("The owner-requested Arts Master was not created.");
      return { operationId, drone, token: game.scenes.get(sceneId).tokens.find(token => token.actorId === drone.id) };
    };
    const pristine = await create("pristine_undo", 1900);
    await api.command(actor, "undoUse", { useId: pristine.operationId }, `${pristine.operationId}_undo`);
    if (game.actors.get(pristine.drone.id) || game.scenes.get(sceneId).tokens.get(pristine.token.id)) throw new Error("Pristine operation-created documents survived undo.");
    const changed = await create("edited_undo", 2100);
    await changed.drone.update({ name: `${changed.drone.name} table edit`, "system.attributes.hp.temp": 9 });
    const preview = previewUndo(actor, changed.operationId);
    if (!preview.lines.some(line => /preserv/i.test(line))) throw new Error("Edited-document undo preview did not explain preservation.");
    await api.command(actor, "undoUse", { useId: changed.operationId }, `${changed.operationId}_undo`);
    if (!game.actors.get(changed.drone.id) || !game.scenes.get(sceneId).tokens.get(changed.token.id)
      || changed.drone.system.attributes.hp.temp !== 9 || actor.flags.ak5e.caster.drones.includes(changed.drone.uuid))
      throw new Error("Edited-document undo failed to preserve edits or unlink.");
    const existing = fromUuidSync(oldLinks[1]), prior = structuredClone(existing.flags.ak5e.artsMaster);
    const unlinked = structuredClone(actor.flags.ak5e.caster); unlinked.drones = oldLinks.filter(uuid => uuid !== existing.uuid);
    await actor.update({ "flags.ak5e.caster": unlinked });
    const linkId = `${suffix}_link_undo`;
    await api.requestDrone(actor, "link", { operationId: linkId, droneUuid: existing.uuid, confirmed: true });
    await api.command(actor, "undoUse", { useId: linkId }, `${linkId}_undo`);
    if (actor.flags.ak5e.caster.drones.includes(existing.uuid) || !game.actors.get(existing.id)
      || JSON.stringify(existing.flags.ak5e.artsMaster) !== JSON.stringify(prior)) throw new Error("Link undo changed existing managed fields or failed to restore the previous links.");
    // Restore this test fixture's original link for the remaining/restart checks.
    const restore = structuredClone(actor.flags.ak5e.caster); restore.drones = oldLinks;
    await actor.update({ "flags.ak5e.caster": restore });
    return { cancellation: true, pristineRemoved: true, editedPreserved: true, preview: preview.lines, linkRestored: true };
  }, { actorId: ids.actors.mech, sceneId: ids.sceneId, suffix: ids.suffix });
  await screenshot(player, "owner-drone-undo-cards");

  const legacyId = `legacy_${ids.suffix}`;
  await gm.evaluate(async ({ actorId, legacyId }) => {
    const actor = game.actors.get(actorId), state = structuredClone(actor.flags.ak5e.caster);
    state.operations.push({ id: legacyId, command: "juryRig", status: "prepared", data: { ap: 1 } });
    await actor.update({ "flags.ak5e.caster": state });
  }, { actorId: ids.actors.mech, legacyId });
  await player.waitForFunction(({ actorId, legacyId }) => game.actors.get(actorId).flags.ak5e.caster.operations.some(op => op.id === legacyId), { actorId: ids.actors.mech, legacyId });
  report.mech.legacy = await player.evaluate(async ({ actorId, legacyId }) => {
    const actor = game.actors.get(actorId), before = JSON.stringify(actor.flags.ak5e.artsPoints);
    let error = "";
    try { await game.ak5e.caster.command(actor, "juryRig", { confirmed: true }, `${legacyId}_new`); }
    catch (failure) { error = failure.message; }
    if (!/reconcil/i.test(error) || JSON.stringify(actor.flags.ak5e.artsPoints) !== before) throw new Error("Unknown legacy operation was replayed or lacked explicit reconciliation guidance.");
    return { error, apUnchanged: true };
  }, { actorId: ids.actors.mech, legacyId });
  await gm.evaluate(async ({ actorId, legacyId }) => game.ak5e.caster.command(game.actors.get(actorId), "reconcile", {
    confirmed: true, operationId: legacyId, reason: "Disposable acceptance fixture: reviewed unchanged AP, no target writes or rolls; abandon legacy prepared operation." }, `${legacyId}_reconcile`), { actorId: ids.actors.mech, legacyId });
}
