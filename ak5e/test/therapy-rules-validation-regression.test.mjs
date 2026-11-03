// Post-candidate regression checks for numeric input validation in the pure
// Therapist rules module. These tests were drafted from the frozen spec and
// adversarial findings after the candidate existed; this is not a test-first claim.
import test from "node:test";
import assert from "node:assert/strict";
import {
  therapyEligibility, activateDoctorIsIn, doctorIsInActive, quoteTherapies,
  riderFor, riderExpired, recuperativeHeal
} from "../scripts/therapist-rules.mjs";

const art = (patch = {}) => ({
  targetCount: null,
  rangeFeet: null,
  rangeTouch: false,
  durationSeconds: null,
  concentration: false,
  restoresHP: false,
  apSpent: 0,
  levelled: false,
  ...patch
});
const state = (concentratedAllowance = 1, expiresAt = 1060) => ({
  doctorIsIn: { chosenId: "energising", expiresAt },
  concentratedAllowance
});
const riderContext = (patch = {}) => ({
  spellMod: 4,
  art: art({ restoresHP: true, apSpent: 2 }),
  castId: "cast-1",
  casterUuid: "Actor.medic",
  targetUuids: ["Actor.patient"],
  worldTime: 1000,
  ...patch
});
const malformedNumbers = [
  ["numeric string", "5"],
  ["NaN", NaN],
  ["positive Infinity", Infinity],
  ["negative Infinity", -Infinity]
];
const rejectsEachMalformedNumber = (t, invoke) => Promise.all(
  malformedNumbers.map(([label, value]) => t.test(label, () => assert.throws(invoke(value), TypeError)))
);

test("eligibility rejects malformed rangeFeet, durationSeconds, and supplied targetCount", async t => {
  await t.test("rangeFeet", async t => rejectsEachMalformedNumber(t, value =>
    () => therapyEligibility("longDistance", art({ rangeFeet: value }))));
  await t.test("durationSeconds", async t => rejectsEachMalformedNumber(t, value =>
    () => therapyEligibility("longTerm", art({ durationSeconds: value }))));
  await t.test("targetCount", async t => rejectsEachMalformedNumber(t, value =>
    () => therapyEligibility("energising", art({ targetCount: value }))));
});

test("numeric but rules-failing eligibility values remain warnings; null remains unknown", () => {
  assert.deepEqual(therapyEligibility("longDistance", art({ rangeFeet: 5 })), { eligible: true, warnings: [] });
  assert.deepEqual(therapyEligibility("longDistance", art({ rangeFeet: 0 })), { eligible: false, warnings: ["rangeTooShort"] });
  assert.deepEqual(therapyEligibility("longDistance", art({ rangeFeet: null })), { eligible: null, warnings: ["unknownRange"] });
  assert.deepEqual(therapyEligibility("energising", art({ targetCount: 0 })), { eligible: false, warnings: ["notSingleTarget"] });
  assert.deepEqual(therapyEligibility("energising", art({ targetCount: null })), { eligible: null, warnings: ["unknownTargets"] });
  assert.deepEqual(therapyEligibility("longTerm", art({ durationSeconds: 59 })), { eligible: false, warnings: ["durationTooShort"] });
  assert.deepEqual(therapyEligibility("longTerm", art({ durationSeconds: null })), { eligible: null, warnings: ["unknownDuration"] });
});

test("Doctor Is In activation rejects malformed worldTime and retained allowance", async t => {
  await t.test("worldTime", async t => rejectsEachMalformedNumber(t, value =>
    () => activateDoctorIsIn({ chosenId: "empowering", worldTime: value, medicLevel: 4, state: null })));
  await t.test("concentratedAllowance in prior state", async t => rejectsEachMalformedNumber(t, value =>
    () => activateDoctorIsIn({ chosenId: "empowering", worldTime: 0, medicLevel: 4, state: state(value) })));
});

test("doctorIsInActive rejects malformed worldTime and expiry state", async t => {
  await t.test("worldTime", async t => rejectsEachMalformedNumber(t, value =>
    () => doctorIsInActive(state(), value)));
  await t.test("expiresAt", async t => rejectsEachMalformedNumber(t, value =>
    () => doctorIsInActive(state(1, value), 1000)));
});

test("quote rejects malformed worldTime, Life Support, allowance/expiry state, and AP spent", async t => {
  const quote = patch => () => quoteTherapies({
    selection: ["recuperative"],
    art: art({ restoresHP: true, apSpent: 2, ...patch?.art }),
    state: patch?.state ?? null,
    worldTime: patch?.worldTime ?? 1000,
    lifeSupport: patch?.lifeSupport ?? 20
  });
  await t.test("worldTime", async t => rejectsEachMalformedNumber(t, value => quote({ worldTime: value })));
  await t.test("lifeSupport", async t => rejectsEachMalformedNumber(t, value => quote({ lifeSupport: value })));
  await t.test("concentratedAllowance", async t => rejectsEachMalformedNumber(t, value => quote({ state: state(value) })));
  await t.test("expiresAt", async t => rejectsEachMalformedNumber(t, value => quote({ state: state(1, value) })));
  await t.test("art.apSpent", async t => rejectsEachMalformedNumber(t, value => quote({ art: { apSpent: value } })));
});

test("quote preserves numeric failure semantics and omitted optional state", () => {
  const quote = quoteTherapies({
    selection: ["empowering"], art: art(), worldTime: 0, lifeSupport: 0
  });
  assert.equal(quote.lifeSupportCost, 5);
  assert.equal(quote.lifeSupportAfter, 0);
  assert.equal(quote.shortfall, 5);
  assert.equal(quote.allowanceAfter, 0);
  // No boundary beyond numeric type is specified for a Life Support pool.
  assert.equal(quoteTherapies({
    selection: [], art: art(), worldTime: 0, lifeSupport: -2
  }).lifeSupportAfter, 0);
});

test("riderFor rejects malformed numeric worldTime, spellMod, and used Art fields", async t => {
  await t.test("worldTime", async t => rejectsEachMalformedNumber(t, value =>
    () => riderFor("empowering", riderContext({ worldTime: value }))));
  await t.test("spellMod", async t => rejectsEachMalformedNumber(t, value =>
    () => riderFor("empowering", riderContext({ spellMod: value }))));
  await t.test("rangeFeet when longDistance reads it", async t => rejectsEachMalformedNumber(t, value =>
    () => riderFor("longDistance", riderContext({ art: art({ rangeFeet: value }) }))));
  await t.test("durationSeconds when longTerm reads it", async t => rejectsEachMalformedNumber(t, value =>
    () => riderFor("longTerm", riderContext({ art: art({ durationSeconds: value }) }))));
});

test("numeric spell modifiers and Art values keep their documented behavior", () => {
  assert.equal(riderFor("empowering", riderContext({ spellMod: -1 })).amount, -1);
  assert.equal(riderFor("longDistance", riderContext({ art: art({ rangeFeet: 0 }) })).rangeFeet, 0);
  assert.equal(riderFor("longTerm", riderContext({ art: art({ durationSeconds: 0 }) })).durationSeconds, 0);
});

test("riderExpired rejects malformed current and persisted expiry world times", async t => {
  await t.test("current worldTime", async t => rejectsEachMalformedNumber(t, value =>
    () => riderExpired({ expires: { worldTime: 1060 } }, { worldTime: value })));
  await t.test("expires.worldTime", async t => rejectsEachMalformedNumber(t, value =>
    () => riderExpired({ expires: { worldTime: value } }, { worldTime: 1000 })));
});

test("recuperativeHeal rejects malformed damage amount", async t => {
  await rejectsEachMalformedNumber(t, value => () => recuperativeHeal(
    { amount: 4, targetUuids: ["Actor.patient"] },
    { id: "damage-1", targetUuid: "Actor.patient", hostile: true, amount: value },
    []
  ));
});

test("numeric non-hostile/zero damage remains a non-healing application", () => {
  const rider = { amount: 4, targetUuids: ["Actor.patient"] };
  assert.equal(recuperativeHeal(rider, {
    id: "damage-0", targetUuid: "Actor.patient", hostile: true, amount: 0
  }, []).heal, 0);
  assert.equal(recuperativeHeal(rider, {
    id: "damage-1", targetUuid: "Actor.patient", hostile: false, amount: 5
  }, []).heal, 0);
});
