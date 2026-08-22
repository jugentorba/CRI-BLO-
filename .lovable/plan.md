# CRI BLO — Finalization plan

Scope is strictly additive. Excel template, existing cell mapping, GPS/address, form logic, and current photo positions stay untouched.

## 1. Supplementary photos → PHOTOS OI only

Current bug: supplementary slots are anchored into the PLAN sheet. Move them to the **PHOTOS OI** sheet, below the existing 4 official photo anchors. Do not touch existing OI/MESURES/OC/PLAN anchors.

- In `src/lib/export/xlsx.ts`: change the extra-photos anchor block from PLAN to `PHOTOS OI`, starting a couple of rows below the last existing OI photo (e.g. row 40+), 2-column grid, up to 10 photos.
- MESURES stays 2 photos max, PHOTOS OC stays unchanged.
- `src/lib/cri/schema.ts` + `visibility.ts`: rename the category header from "Photos supplémentaires" to **"📷 Photos supplémentaires (PHOTOS OI)"**, keep the 0–10 counter, keep camera/gallery/preview/replace/delete via existing `PhotoSlot`.
- If `extraPhotosCount = 0` → no anchor written → Excel export byte-identical to today.

## 2. Fichiers supplémentaires (external attachments)

New feature at the end of the CRI form, before export. Not tied to photo slots and never written into Excel.

- New store `STORE_ATTACHMENTS` in `src/lib/db.ts` (keyed by `${criId}/${uid}`, storing `{ criId, id, name, size, type, blob }`).
- New module `src/lib/attachments/repository.ts` with `addAttachment / listAttachments / deleteAttachment / clearAttachments`.
- New component `src/components/cri/AttachmentsSection.tsx` rendered at the bottom of `src/routes/cri.$id.tsx`:
  - "+ Ajouter un fichier" opens a hidden `<input type="file" multiple>` accepting `*/*` (PDF/Word/Excel/images/etc.).
  - List each file: name, human-readable size, remove button.
  - Files persist per-CRI in IndexedDB, survive reloads, work fully offline.

## 3. Export options

Keep current "Exporter Excel" as-is. Rename generated file to `CRI_BLO_{Commune}_{NuméroDossier}.xlsx` via `src/lib/export/naming.ts` (previously `CRI BLO - {ref} - {commune}.xlsx`). Update PDF/HTML naming similarly for consistency.

Add a second button **"Exporter dossier ZIP"**:
- Uses `jszip` (already available? if not `bun add jszip`).
- Generates the Excel workbook in-memory (reuse existing `buildWorkbook`), places it at ZIP root as `CRI_BLO_{Commune}_{Num}.xlsx`, then adds every attachment under `attachments/{originalName}` (dedupe collisions with `-2`, `-3`).
- ZIP filename: `{NuméroDossier}_{Commune}.zip`.
- Both exports go through the existing `writeFileToExportFolder` / `downloadBlob` path — no change to the export engine.

## 4–6. OneDrive sync (optional)

Fully optional. App keeps working when disabled or offline; local IndexedDB stays the source of truth.

**Auth (MSAL browser, PKCE, no password in-app):**
- `bun add @azure/msal-browser`.
- New secret `VITE_ONEDRIVE_CLIENT_ID` (public, entered by the user in Lovable Cloud) — required for the Azure app registration.
- Scope: `Files.ReadWrite.AppFolder offline_access` (App Folder = sandboxed `/Apps/CRI BLO Assistant/`, safest permission).
- `src/lib/onedrive/auth.ts`: `login()`, `logout()`, `getToken()` (silent + popup fallback), `getAccount()`.

**Graph client `src/lib/onedrive/graph.ts`:**
- `ensureFolder(path)` → creates `Drafts`, `Excel Exports`, `ZIP Packages` inside the app folder on first use.
- `uploadFile(path, blob)` using `PUT /drive/special/approot:/{path}:/content` (small-file) or upload session for >4 MB (ZIPs).
- Track `syncStatus` per record: `pending | synced | error`, plus `lastSyncedAt`.

**Settings page (`src/routes/parametres.tsx`):**
- New section "Synchronisation cloud" with:
  - Toggle "Cloud Sync ON/OFF"
  - Provider label "Microsoft OneDrive"
  - Button "Connecter OneDrive" / "Déconnecter"
  - Signed-in account email
  - Last sync date + current status
- New settings fields: `cloudSyncEnabled`, `cloudProvider`, `lastSyncAt`.

## 7–9. Local-first, offline queue, multi-device

- `src/lib/onedrive/queue.ts`: queue of pending uploads (draft JSON, Excel, ZIP, attachments), persisted in IndexedDB.
- Every export writes locally first, then enqueues an upload if sync is ON.
- `useOnline` already exists; when it flips to online, drain the queue.
- Auto-sync drafts (serialized CriRecord + attachments manifest) on save when enabled.
- Pull path (lightweight): on app start with sync ON, list `Drafts/` in OneDrive and merge any newer records into local IndexedDB by `updatedAt`. This enables the same account on tablet/phone/PC.
- Files "Waiting for synchronization" are visibly flagged in the history list.

## 10. Test pass

Manual smoke test before publish:
1. New CRI with GPS, official photos, 3 supplementary photos, 2 attachments.
2. Excel export → open, verify template intact, official photos in place, 3 supplementary photos on PHOTOS OI below existing anchors.
3. ZIP export → filename `123456_Auzits.zip`, contains Excel + `attachments/`.
4. Toggle OneDrive OFF → everything still works offline.
5. Toggle ON, connect account, re-export → files appear under `/Apps/CRI BLO Assistant/Excel Exports` and `/ZIP Packages`.
6. Airplane mode + export → local files OK, queued items show "Waiting", sync resumes when back online.

## Technical notes

- No changes to `xlsx.ts` cell writes, only the supplementary-photo anchor block moves from PLAN → PHOTOS OI.
- All new deps: `jszip`, `@azure/msal-browser`. Everything else stays.
- OneDrive client ID is a **public** (publishable) value — safe to keep in `.env` as `VITE_ONEDRIVE_CLIENT_ID`. The user must create an Azure AD app registration (SPA, redirect URI = published site + preview site) and paste the client ID once; I'll walk them through it before enabling.

## Open question before I start

The Azure app registration is a one-time manual step the user must do in the Microsoft admin portal (I cannot do it for them). Do you want me to:
- **A**: Implement everything now, leave OneDrive disconnected until you paste the Client ID; I'll provide step-by-step instructions.
- **B**: Skip OneDrive for now, ship #1–3 (supplementary photos fix + attachments + ZIP export) immediately, add OneDrive in a follow-up once the Azure app is ready.

I recommend **B** — it delivers value today and avoids a half-wired OAuth flow.
