# MUSIC-035 portable import — explicit save boundary

2026-11-03 / development-only improvement.

The original portable import said local persistence was optional but did not suppress pending autosave or pagehide. A successful import could therefore write private audio to local IndexedDB even without pressing **編集状態を保存**.

The import now suspends debounce/pagehide autosave before modifying the editor, waits for prior queued writes, and keeps the imported song transient until the user explicitly presses the local Save button. On failed validation/restore it resumes the prior state and autosave policy. A separate fresh Chromium browser context tests import → pagehide → zero local project/audio writes, then explicit save → two audio blobs persisted → reload and restore. It uses only synthetic WAV.

The .asahi-music file stays offline; no network, production, or customer recordings are used.
