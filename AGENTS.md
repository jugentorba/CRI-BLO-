# CRI-BLO repository rules

This GitHub repository is the source of truth for CRI-BLO.

- Do not depend on Lovable or any other hosted editor for source code, runtime services, builds, configuration, or deployment.
- Keep the project buildable from the files committed in this repository plus documented environment variables/secrets.
- Preserve the existing CRI-BLO field workflow, Orange Excel template, mappings, local data and export compatibility while improving reliability.
- Keep Android, iOS and PWA implementations in the same project where practical, with native platform code committed to the repository once introduced.
- Never mark work complete without the required build and real-device acceptance checks.
- Avoid rewriting published Git history. Use normal commits and reviewable branches.
