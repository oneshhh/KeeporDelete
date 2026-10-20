# Keep or Delete

**A free, privacy-first Windows photo and video organizer for quickly sorting large local media libraries, removing unwanted files, grouping photos by people, and reclaiming storage space. Everything runs locally on your computer.**

## Download

[**Download Keep or Delete 2.4.1 for Windows**](https://github.com/oneshhh/KeeporDelete/releases/download/v2.4.1/Keep-or-Delete-Setup-2.4.1.exe)

The guided installer lets you choose where the application is installed and includes a standard Windows uninstaller.

**Requirements:** Windows 10 or Windows 11, 64-bit.

**SHA-256:** `4D9F45062C7E37445DA0CD2921047B585411714B9173A382FAD2D1C4548D7DE4`

## New in 2.4.1

- Fixes the missing Windows runtime prerequisite that could prevent the face engine from loading in 2.4.0. The installer now bundles Microsoft's signed Visual C++ runtime and checks installation results.
- Install over the existing app. Completed 2.4.0 face scans do not need resetting.

## Face recognition improvements in 2.4

- New offline AuraFace recognition uses 512-number signatures and library-wide comparisons to reduce groups split by angle and lighting.
- Same Person corrections remain stable when reopening or regrouping, with exact selected unique-photo counts.
- Grouping retains up to 64 varied signatures per person and accepts up to 12 reference photos.
- The recognition model is included for offline use; the installer is approximately 424 MB.
- **Upgrading from 2.3.1 or earlier requires a one-time face rescan per folder and adding reference photos again.** The previous encrypted face index is backed up before migration. Original photos and videos are preserved.

Recognition can still make mistakes or split difficult faces; accuracy varies with image quality.

## Why I built it

Keep or Delete is made for people who still believe in keeping their memories on local storage. It helps anyone who saves photos and videos on a laptop, maintains a personal backup, or needs a simple way to sort through a large media library and keep only what matters.

The idea came from my own photo backup. Three years of photos had grown to 50 GB and included unnecessary screenshots, memes, and images I no longer needed. Opening and deleting every file manually was slow and frustrating, and I could not find a genuinely free app that solved the problem simply.

Keep or Delete provides a fast Keep/Delete workflow, a browsable Album, optional offline face recognition and people grouping, reel-style video browsing, Apple Live Photo support, and a final Trash review before anything is removed.

## Features

- Fast Keep/Delete decisions with buttons or keyboard shortcuts.
- Album browser with newest, oldest, file-size, photo, and video filters.
- Optional offline face recognition for finding and grouping people.
- Duplicate-photo comparison with enlarged previews and one-click keep selection.
- Apple Live Photo and HEIC/HEIF support.
- Reel-style video browsing.
- Folder storage, saved storage, and reclaimable-space statistics.
- Previous and Undo controls for correcting decisions.
- Final Trash review before files move to the Windows Recycle Bin.
- No account, subscription, cloud storage, or media upload required.

## Install

1. Download `Keep-or-Delete-Setup-2.4.1.exe` from the latest release.
2. Open the installer and approve the Windows installation prompt.
3. Keep the default Program Files location or choose another folder.
4. Open **Keep or Delete** from the desktop or Start menu.

To uninstall, open **Windows Settings → Apps → Installed apps**, select **Keep or Delete**, and choose **Uninstall**.

**Updating an existing installation:** Close the app, run the new installer, and keep the current installation location. Your photos and saved app data are preserved. When upgrading from 2.3.1 or earlier, reopen each folder for a one-time face rescan and add your reference photos again. A backup of the previous encrypted face index is saved before migration. Clear Face Data removes both the active index and this backup.

## Privacy

Photos, videos, face templates, names, and tags remain on your computer. Face grouping is optional and processed locally. Confirmed deletions are moved to the Windows Recycle Bin so they can still be recovered through Windows.

## License

Keep or Delete is distributed under the [MIT License](LICENSE).
