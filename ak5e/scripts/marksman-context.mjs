/** A roll keeps its selected target even if the user changes targets while its dialog is open. */
export function marksmanAttackTarget(config) {
  const roll = config?.rolls?.[0];
  if (!roll) return { token: null, actor: null, uuid: null };
  roll.options ??= {};
  let snapshot = roll.options.ak5eTargetSnapshot;
  if (!snapshot) {
    const selected = globalThis.game?.user?.targets?.first?.() ?? Array.from(globalThis.game?.user?.targets ?? [])[0];
    const requested = config.ak5eTargetUuid;
    const document = requested ? globalThis.fromUuidSync?.(requested) : selected?.document;
    const token = document?.object ?? (document?.documentName === "Actor" ? document.getActiveTokens?.()?.[0] : selected);
    const actor = document?.actor ?? (document?.documentName === "Actor" ? document : token?.actor);
    snapshot = { uuid: document?.uuid ?? token?.document?.uuid ?? actor?.uuid ?? null, actorUuid: actor?.uuid ?? null,
      elevation: Number(document?.elevation ?? token?.document?.elevation ?? token?.elevation ?? 0),
      center: token?.center ? { x: token.center.x, y: token.center.y } : null, disposition: document?.disposition ?? token?.document?.disposition };
    roll.options.ak5eTargetSnapshot = snapshot;
  }
  const document = snapshot.uuid && globalThis.fromUuidSync?.(snapshot.uuid);
  const current = globalThis.game?.user?.targets?.first?.();
  const actor = document?.actor ?? (document?.documentName === "Actor" ? document : globalThis.fromUuidSync?.(snapshot.actorUuid)) ??
    (current?.document?.uuid === snapshot.uuid ? current.actor : null);
  const token = snapshot.uuid ? { ...(document?.object ?? {}), actor,
    document: { uuid: snapshot.uuid, elevation: snapshot.elevation, disposition: snapshot.disposition, flags: document?.flags },
    elevation: snapshot.elevation, center: snapshot.center } : null;
  return { token, actor, uuid: snapshot.uuid };
}

export function inheritMarksmanAttackContext(config) {
  const messageId = config.event?.target?.closest?.("[data-message-id]")?.dataset?.messageId;
  const message = messageId && globalThis.game?.messages?.get?.(messageId);
  const original = message?.rolls?.find(roll => roll.options?.ak5eTargetSnapshot);
  const card = message?.getFlag?.("ak5e", "marksmanAttack") ?? message?.flags?.ak5e?.marksmanAttack;
  if (!config.ak5eTargetUuid) config.ak5eTargetUuid = original?.options.ak5eTargetSnapshot?.uuid ?? card?.targetUuids?.[0];
  for (const roll of config.rolls ?? []) {
    roll.options ??= {};
    if (original?.options.ak5eMarksman) roll.options.ak5eMarksman ??= structuredClone(original.options.ak5eMarksman);
  }
}
