# B-087 · Low · Private-server practice

Area: Defender, Dreadnought and Artshield

**B-087 (fixed 2026-10-10, 0.5.1) · Low · Private-server practice.** Several sessions share the default test server
(port 30135, `/tmp/ak5e-standard-test`) and one session's shutdown killed another's run. Use a
copy of the data dir and a private port, and stop servers by PID.
**Resolution:** Main and Luna live runs used separate private data copies/ports (30159 and 30161). Each server was controlled by its own PID; the test procedure is documented.
