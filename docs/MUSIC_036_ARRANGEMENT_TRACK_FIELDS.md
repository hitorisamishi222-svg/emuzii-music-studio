# MUSIC-036 — Arrangement track metadata safety

The original project save serialized global guide notes/chords/song-form, but not each arrangement/chord-design track's own chords, tone, beats, BPM, section, style, and power. As a result a reload or portable backup discarded track-level arrangement parameters even though the tracks were still present.

The development branch now includes these optional fields in local and portable snapshots, and validates them before a restore can replace the current editor. Legacy missing fields stay null and load safely rather than guessing musical settings. The actual audio source/recorded take bytes are not modified.

Unit tests verify both serialization and validation, including malformed values and missing legacy fields. Android real-device, user songs, production and real GPU remain untouched.
