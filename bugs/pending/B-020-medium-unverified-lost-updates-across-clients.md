# B-020 · Medium · Unverified: lost updates across clients

Area: SI-2 resource pools

**B-020 · Medium · Unverified: lost updates across clients.** `keyedSerial` orders writes only
within one client. A player's `spendPool` and the GM's `recoverPool` write absolute values and
can overwrite each other. Needs a version/receipt check or routing writes through the GM
(as the SI-1 kernel does for operations).
