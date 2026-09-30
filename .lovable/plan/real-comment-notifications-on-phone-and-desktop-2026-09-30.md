# Real comment notifications on phone and desktop

## What users get
- A system notification (the kind that pops up outside the app) every time someone comments, replies, or @mentions them on Orders, Collections, Deliveries, Sharpening, or Repairs.
- The title shows who sent it and what they did, for example "Nathan replied · PO-2709". The body shows the full comment text, not cut short.
- Tapping the notification opens the app on that order.
- A one-time "Turn on notifications" prompt, plus an on/off switch in Settings > Notifications. Each device is switched on separately.

## Where it works
| Device | App open | App closed |
|---|---|---|
| Desktop browser (Chrome, Edge, Firefox, Safari) | Yes | Yes |
| Android in the browser or installed from the browser | Yes | Yes |
| iPhone added to the Home Screen (iOS 16.4+) | Yes | Yes |
| Aleph Android app (the downloaded APK) | Yes | Only after Firebase is connected (see below) |

## Technical details
- **Full text:** change the comment alert triggers so they save the whole comment instead of the first 140 characters. The notification list in the app stays short because it already clips the text.
- **Push when the app is closed:** use standard browser push with VAPID keys, saved as backend secrets.
  - Add a small service worker that only handles `push` and `notificationclick`. It won't cache anything or register in the editor preview.
  - Devices are saved in the existing `push_subscriptions` table.
- **Sending:** a new `send-push` edge function runs on every new row in `notifications` whose type is a comment, reply, mention, or item note. The trigger calls it through `pg_net` with a shared secret. The function looks up the recipient's devices, sends the push, and removes devices that are no longer valid.
- **Push while the app is open:** listen for new rows in `notifications` and show a system notification. The web version uses the service worker. The Android app uses `@capacitor/local-notifications`.
- **Android app when closed:** needs a Firebase Cloud Messaging connection plus `@capacitor/push-notifications`. After that, you pull the code, run `npx cap sync`, and build a new APK. This is a separate step and needs your go-ahead, because it means creating a Firebase project.
- **Your own comments:** you are never notified about comments you wrote. The existing triggers already skip the sender.
