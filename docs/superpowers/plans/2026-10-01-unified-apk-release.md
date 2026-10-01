# Unified CRI BLO APK release plan

> Use superpowers:executing-plans to implement in this isolated release branch.

Goal: produce a reviewable Android release containing both native export fixes and complete-history backup controls.
Architecture: merge criblo-master-spec-v1 into the current main lineage; retain the native workflow and add main cloud features. Make every build consume its checked-out revision.
Tech stack: React, IndexedDB, Capacitor 8, Gradle, GitHub Actions.
Spec: existing user requests to finalise the APK, preserve searchable dossier history, support Google Drive with OneDrive/local alternatives, and keep native export fixes.

Constraints: com.criblo.app remains stable; never replace the existing permanent signing key; no private signing material in git; no claim of device-tested history migration.

Review focus: native plugin inclusion, branch selection, cloud configuration, backup writes on Android, preserving database name and version.

- [ ] Merge existing native fixes with backup settings; validate build and existing regression suite.
- [ ] Correct workflows to build the checked-out source with native manifest patch and cloud variables; production must use the permanent key.
- [ ] Validate generated Android wrapper, run Android CI, inspect artifact certificate and bundled features.
- [ ] Preserve source in a reviewable PR and report blockers for production cloud sign-in and real-device migration.

Ruling: retain the native branch Gemini implementation and its settings migration rather than reintroducing the retired generic AI endpoint. This follows that branch explicit migration and avoids divergent AI entry points.
Ruling: work in a freshly cloned checkout on a new branch; main and existing device data are untouched.

Progress: merged native and cloud trees. Build passed; typecheck initially exposed six errors (DOM shadowing, PDF cleanup API, missing comment function, nullable gallery URL, zoom type, browser cloud folder). Fixed all; comment stub replaced with device-local Gemini configuration, covered by missing/configured key tests. Native backup now requires a verified file write, covered by five tests. Workflow regression test failed on cross-branch publishing, then passed after correction.
