# B-306 · Medium · Infuser sheet lacks Infusion choices and range measurement

Area: Specialist / Infuser sheet

Found by the adversarial Luna pair and verified by parent code inspection, 2026-10-25.

Evidence: the generic sheet handler supplies target UUID/name but no Infusion selection or distance. The plan defaults to Adrenaline Trigger and checks only supplied distance.

Reproduce: open Apply Infusion from the sheet; the other seven options cannot be selected and distant targets produce no range warning.

**Fixed means:** all eight options are reachable; current tokens supply measured range where available (5 feet, 30 from level 11). Source warnings are displayed before commitment and can be publicly overridden. Closing every prompt changes nothing.
