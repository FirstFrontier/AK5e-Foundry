/**
 * One serial queue per Actor, shared by Supporter setup and progression (U4). Both read a snapshot, update the class Item
 * and then create Items, so two overlapping clicks could both pass the "nothing to do yet" check and double-apply. Running
 * them one after the other, per Actor, makes the second see the first's result. Different Actors never wait on each other,
 * and a failed task never blocks the next one (keyedSerial).
 */
import { keyedSerial } from "./operation-kernel.mjs";

export const supporterSerial = keyedSerial();
