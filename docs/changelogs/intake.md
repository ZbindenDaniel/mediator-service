# Changelog: Device Intake Station

Covers: device intake cataloguing flow, quality questions at intake, netboot architecture, Phase 1/2 separation, scan.txt.

---

## 845. ✅ Device Intake Station API — 4 endpoints + Phase 2 file upload support
   - **Why:** Alpine Linux netboot image on donated devices needs a minimal API to catalog items without a full UI. State machine routes each device boot to the correct step (select_ref → quality → phase2) based on DB state, so already-completed steps are skipped automatically. Phase 2 test results upload via the existing external-docs endpoint with SN:/MAC: prefix to bypass the DB lookup before item creation.
   - **Deferred:** scan.txt augmentation of agentic extraction prompt (reading Phase 2 scan results before the agentic run starts); operator notification on completion; InstanceSpecs sync across ref-sharing instances. These are v2 concerns that don't block the core flow.
