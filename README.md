# Clairy Daily HQ — free synced edition

This version is designed to keep working without a ChatGPT subscription.

- **GitHub Pages** hosts the interface for free.
- **Firebase Authentication** keeps the dashboard behind email/password or Google sign-in.
- **Cloud Firestore** syncs tasks, notes, urgency, and achievements across MacBook and iPad.
- Each signed-in Google user can access only their own records.
- Client task details are not embedded in the public website files.

## One-time setup

### 1. Create the free Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/).
2. Create a project named `Clairy Daily HQ` and keep it on the no-cost **Spark** plan.
3. Google Analytics is optional and can be left off.
4. Under **Build → Authentication**, select **Get started**, enable **Google**, and save.
5. Under **Build → Firestore Database**, create a database in production mode.
6. Open the Firestore **Rules** tab, paste the contents of `firestore.rules`, and publish.

### 2. Connect the web app

1. Open **Project settings → Your apps → Add app → Web**.
2. Name it `Clairy Daily HQ Web` and register it.
3. Copy the Firebase configuration values into `firebase-config.js`.
4. In **Authentication → Settings → Authorized domains**, add your future GitHub Pages domain, such as `yourusername.github.io`.

Firebase web configuration is designed to be included in front-end code. The Firestore rules—not secrecy of that configuration—protect the records.

### 3. Publish with GitHub Pages

1. Create a new public GitHub repository named `clairy-daily-hq`.
2. Upload the contents of this project folder. Do not upload your private `clairy-hq-export.json` backup.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and the `/(root)` folder, then click **Save**.

### 4. Import the existing dashboard

1. Open the new GitHub Pages dashboard and sign in with Google.
2. Add `/import.html` to the end of the dashboard URL.
3. Select your private `clairy-hq-export.json` backup from your device.
4. Import the 33 tasks and 18 saved progress records.
5. Return to the dashboard and verify today’s checklist.

## iPad

After confirming syncing, open the GitHub Pages URL in Safari, tap **Share → Add to Home Screen**, enable **Open as Web App**, and tap **Add**.

## Privacy notes

- Do not upload your private `clairy-hq-export.json` backup to a public repository.
- Do not weaken `firestore.rules` to `allow read, write: if true`.
- Keep the existing dashboard available until both devices show the same task update.
