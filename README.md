# Keep or Delete

**A free, privacy-first Windows photo and video organizer for quickly sorting large local media libraries, removing unwanted files, grouping photos by people, and reclaiming storage space. Everything runs locally on your computer.**

## Download

[**Download Keep or Delete 2.5.4 for Windows**](https://github.com/oneshhh/KeeporDelete/releases/download/v2.5.4/Keep-or-Delete-Setup-2.5.4.exe)

The guided installer lets you choose where the application is installed and includes a standard Windows uninstaller.

**Requirements:** Windows 10 or Windows 11, 64-bit.

**SHA-256:** `1A8F656C1728E9324BE4C62AEA9FDC027732F34714AB0C1C5A99CBF6F8E862FE`

## New in 2.5.4

- **A dedicated Album viewer:** open photos to view them instead of entering triage. Left/Right arrows browse the current sort order and filters; Escape or Back to Album returns to the same grid position. Videos, animated images and paired Live Photos also play in the viewer.
- **Safe browsing:** the viewer has no Keep/Delete actions, and its shortcuts cannot change decisions, triage position or saved progress. Undoing triage decisions is limited to triage.
- **Drag selection:** draw a box from empty Album space to select several files, or from an unselected photo in Select mode. Holding near the top or bottom scrolls through more rows. Ctrl/Command toggles selection, Shift adds, and Escape cancels. Selected files can still be copied or dragged out together.
- **Stable interactions:** background updates wait until viewing or selecting finishes before replacing the grid. Finishing a selection gesture does not accidentally open a photo.
- **Centered navigation:** the top tabs stay centered at half and full width. Window controls use matching icons with a Restore state, and triage Previous/Next controls have equal sizes and matching arrows.

Existing current-model face scans, references and confirmed corrections are reused. No full face rescan is required when updating from 2.4.x / 2.5.x.

## Previous improvements in 2.5.3

- **A cleaner People view:** one-photo groups are tucked away while remaining in Find More Matches and future grouping. Show them when needed or use Add to People to keep a group visible. Face identity calculations remain unchanged from 2.5.2.
- **Smarter duplicate checks:** compare photos, paired Live Photos and videos. Checks wait for People scanning by default, or start immediately when requested. Saved encrypted signatures reuse unchanged files, and new files are checked automatically while the library is open.
- **Scan progress:** progress bars, elapsed time and approximate time remaining for both People and duplicate scans.
- **People in Album:** find one person's photos or photos containing several selected people together, including faces in one-photo groups.
- **Album selection and copying:** selection mode, Ctrl-click, Shift ranges, Select all shown, Deselect, native Windows file Copy / Ctrl C, drag-out and Send to Trash. Paste copied files in Explorer with Ctrl V.
- **More media filters:** Live Photos, GIFs, WebP and HEIC/HEIF, alongside photos and videos. Video playback displays duration.
- **Clearer Trash actions:** Send unreviewed photos to Trash queues choices without switching away from People. Album and duplicate actions also keep the current page open. Final removal still requires confirmation in Trash.
- **Navigation and windows:** Previous/Next browse without changing decisions; Undo reverses a decision. Album has its own navigation entry, smaller layouts wrap controls, and right-clicking Maximize offers Left half / Right half.
- **Reliable resume:** each folder remembers its choices and current photo by ID, so adding files does not shift your saved place.

Existing current-model 2.4.x / 2.5.x face scans are reused. Newly added files are scanned; these changes do not require a full face rescan or adding current-model references again.

Similar-video suggestions compare duration and three sampled frames. Review the full clip and sound before removing a copy. Paired Live Photos keep their still and motion files linked. Nothing is removed automatically.

## Previous improvements in 2.5.2

- Corrects the average face-signature calculations used when adding photos and combining groups.
- Checks ambiguous matches even when two candidates appear very close, while retaining same-photo and competing-person safeguards.
- Preserves established pose coverage; an experimental ranking change that split confirmed matches is not enabled.
- Prevents saved reference signatures from being mixed across incompatible model versions, including changes that still produce 512-number signatures, with encrypted migration backups.
- Existing current-model scans are reused and regrouped. No full rescan or adding current-model reference photos again is required when updating from 2.4.x or 2.5.x.

The packaged app passed native and portable face-engine checks and encrypted upgrade tests. Nine confirmed same-person pairs remain together and 44 confirmed different-person comparisons remain separate in the local regression. These limited examples do not establish whole-library accuracy or fewer splits in every album.

## Previous improvements in 2.5.1

- Better matching across angles and expressions compares small groups with the closest saved views of a person, with safeguards for competing people and different faces appearing together.
- **Find more matches** searches existing scans for likely split groups. Review the faces, bulk-select results, deselect mistakes, and confirm **Same Person** with the exact unique-photo count.
- **Deselect all** clears your People selection in one step.
- Saved 2.4 and 2.5 scans are regrouped when you reopen the folder. No full rescan or reference-photo re-enrollment is needed for this update. Original media and confirmed corrections are preserved.
- Includes the Windows runtime installer and offline portable fallback introduced in 2.4.1 and 2.4.2.

On a local 514-photo test set, all seven user-confirmed missed-match pairs now join and the group count changes from 94 to 87. This is a limited validation; it does not establish accuracy for every face or library.

## Face recognition improvements in 2.4

- New offline AuraFace recognition uses 512-number signatures and library-wide comparisons to reduce groups split by angle and lighting.
- Same Person corrections remain stable when reopening or regrouping, with exact selected unique-photo counts.
- Grouping retains up to 64 varied signatures per person and accepts up to 12 reference photos.
- The recognition model is included for offline use; the installer is approximately 448 MB.
- **Upgrading from 2.3.1 or earlier requires a one-time face rescan per folder and adding reference photos again.** The previous encrypted face index is backed up before migration. Original photos and videos are preserved.

Recognition can still make mistakes or split difficult faces; accuracy varies with image quality.

## Why I built it

Keep or Delete is made for people who still believe in keeping their memories on local storage. It helps anyone who saves photos and videos on a laptop, maintains a personal backup, or needs a simple way to sort through a large media library and keep only what matters.

The idea came from my own photo backup. Three years of photos had grown to 50 GB and included unnecessary screenshots, memes, and images I no longer needed. Opening and deleting every file manually was slow and frustrating, and I could not find a genuinely free app that solved the problem simply.

Keep or Delete provides a fast Keep/Delete workflow, a browsable Album, optional offline face recognition and people grouping, reel-style video browsing, Apple Live Photo support, and a final Trash review before anything is removed.

## Features

- Fast Keep/Delete decisions with buttons or keyboard shortcuts.
- Album browser and dedicated viewer with people, media-type, date and file-size filters, drag selection, file copying and drag-out.
- Optional offline face recognition for finding and grouping people.
- Duplicate photo, Live Photo and video comparison with enlarged previews and keep selection.
- Apple Live Photo and HEIC/HEIF support.
- Reel-style video browsing.
- Folder storage, saved storage, and reclaimable-space statistics.
- Previous/Next for browsing and Undo for correcting decisions, with per-folder resume.
- Final Trash review before files move to the Windows Recycle Bin.
- No account, subscription, cloud storage, or media upload required.

## Install

1. Download `Keep-or-Delete-Setup-2.5.4.exe` from the latest release.
2. Open the installer and approve the Windows installation prompt.
3. Keep the default Program Files location or choose another folder.
4. Open **Keep or Delete** from the desktop or Start menu.

To uninstall, open **Windows Settings → Apps → Installed apps**, select **Keep or Delete**, and choose **Uninstall**.

**Updating an existing installation:** Close the app, run the new installer, and keep the current installation location. Your photos and saved app data are preserved. When upgrading from 2.3.1 or earlier, reopen each folder for a one-time face rescan and add your reference photos again. A backup of the previous encrypted face index is saved before migration. Clear Face Data removes both the active index and this backup.

## Privacy

Photos, videos, face templates, names, and tags remain on your computer. Face grouping is optional and processed locally. Confirmed deletions are moved to the Windows Recycle Bin so they can still be recovered through Windows.

## License

Keep or Delete is distributed under the [MIT License](LICENSE).
