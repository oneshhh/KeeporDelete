# Keep or Delete

A private Windows desktop app for quickly sorting a folder of photos and videos.

## Use the app

1. Run `dist/Keep-or-Delete-Setup-2.1.2.exe` once to open the guided installer.
2. Keep the default `C:\Program Files\Keep or Delete` location or choose another folder on the destination page. Windows asks for administrator approval when installing in Program Files.
3. Open **Keep or Delete** from the desktop or Start menu. The installed build starts much faster than the old self-extracting portable version.
4. Choose a folder and optionally include nested subfolders.
   - Turn on **Group photos by people** if you want the optional offline People page.
5. Press `K` or `Right Arrow` to keep an item.
6. Press `D` or `Left Arrow` to add an item to the review queue.
7. Use **Previous** or press `P` to reopen the last decision and choose again.
8. Review Trash, restore mistakes, and confirm when ready. A progress bar follows each item as it moves to the Recycle Bin.

## Uninstall

Open **Windows Settings → Apps → Installed apps**, find **Keep or Delete**, and choose **Uninstall**. The same uninstaller is also available inside the chosen installation folder.

Use **Home** in the top navigation at any time to return to folder selection. The current folder remains available through **Resume** until a different folder is selected.

The session sidebar shows the selected folder, total media size, storage marked to keep, reclaimable storage, photo/video/Live Photo totals, and review progress. Use **Choose New Folder** there to switch folders without losing access to the current session if the picker is cancelled.

Confirmed items are moved to the Windows Recycle Bin. Kept files are never modified or moved.

The interface bundles the open-source Inter Variable typeface for a clean,
SF Pro-style appearance that remains consistent across Windows computers.

## People grouping

- People grouping is optional and runs locally. Photos and face templates are not uploaded.
- The app scans ordinary photos and the still image from an Apple Live Photo. It does not scan ordinary videos.
- Progress is saved per folder. Unchanged photos reuse their previous result the next time the folder is opened.
- Add one to three clear reference photos if you want the app to identify you. Reference photos should contain one visible face.
- Name people or add tags, select one or more people, and match **Any selected person** or **Everyone together**.
- If one person is split into separate groups because of angle or lighting, select those groups and choose **Same Person**. The app remembers the correction for future scans of that folder. Open the corrected person and choose **Undo “Same Person” Correction** if it was a mistake.
- **Sort Matching Photos** opens the usual Keep/Delete view for only those photos. **Add Undecided to Trash** adds matches to the review queue; it never bypasses the final Trash review.
- Face templates, names, and tags are encrypted with Windows secure storage. Use **Manage Face Data** on the People page to clear them without changing the original photos.
- Face matching can make mistakes. Always inspect Trash before confirming deletion.

## Media behavior

- Apple Live Photos are detected when a still image and video share the same folder and base filename, such as `IMG_1001.HEIC` and `IMG_1001.MOV`.
- Live Photo components are always kept or recycled together.
- HEIC/HEIF still images are converted only to a temporary preview; the original file is untouched.
- Videos that the embedded player cannot decode are converted to temporary H.264 previews; the original file is untouched.
- The app works locally and does not upload media.

## Shortcuts

- `K` or `Right Arrow`: Keep
- `D` or `Left Arrow`: Add to Trash review
- `Ctrl+Z`: Undo
- `P`: Reopen the previous decision
- `T`: Open Trash review
- `Space`: Play or pause
- `M`: Mute or unmute
- `Up/Down` or mouse wheel in Video mode: Browse reels

## Development

```text
npm start
npm run test:smoke
npm run test:faces
npm run dist
```
