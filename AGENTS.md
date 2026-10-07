# Project implementation rules

- Keep the centred operational popup entrance animation in the global theme so Orders, Collections, Deliveries, and other order surfaces share identical motion.
- Position custom right-click menus with the shared viewport-aware hook so they flip and remain fully visible near every screen edge.- Comment push: notifications INSERT trigger -> send-push edge fn (VAPID web push, claims row via pushed_at); SW push handlers live in public/push-sw.js imported by workbox; native app uses local notifications while open. Why: one pipeline for every device.
- Windows app: desktop/ Electron shell loading the live site, built to an NSIS .exe on windows-latest in the same workflow and attached to the same GitHub release as the APK. Why: real installer that always stays up to date, and releases/latest serves both files.
- Fabrication projects: fabrication_* tables + private fabrication-files bucket (signed URLs); A4 PDF built client-side in src/lib/fabricationPdf.ts. Why: one self-contained workspace that prints without a server.
