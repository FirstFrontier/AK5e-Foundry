# B-060 · Low · Three copies of the request transport

Area: SI-1 operation kernel and Operator Skills

**B-060 · Low · Three copies of the request transport.** `operator-skills.mjs`
(`submitOperatorCommand`/`handleOperatorRequest`) still carries its own chat-message transport
and journal; only the queue was shared. Migrating it changes SP-ledger replay semantics and needs
its own tests.
