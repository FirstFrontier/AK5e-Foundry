/**
 * One serial queue per Bard Actor for every Bard writer that is not already a Supporter play-use command. The Supporter
 * engine serializes `command`, `undoUse` and `useRoll` per Actor (supporterUses.serial); the rest handler, the one-minute
 * Emergency Improv expiry and turn-end clean-up rewrite parts of `flags.ak5e.bard` (notably the whole `performances`
 * array, which Foundry cannot address by index), so they queue on the same chain and read the state inside the task.
 *
 * Never call `supporterUses.execute` / `command` from inside a `bardSerial` task: they queue on the same chain, so the
 * task would wait for itself.
 */
import { supporterUses } from "./supporter-uses.mjs";

export const bardSerial = (actor, task) => supporterUses.serial(actor, task);
