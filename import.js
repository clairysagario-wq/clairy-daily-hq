import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  doc,
  getFirestore,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const root = document.querySelector("#import-app");
const configured = !Object.values(firebaseConfig).some((value) => String(value).startsWith("REPLACE_WITH_"));

if (!configured) {
  root.innerHTML = `<div class="alert">Firebase configuration is still needed before importing.</div>`;
} else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await setPersistence(auth, browserLocalPersistence);

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      root.innerHTML = `
        <form class="login-form" id="import-email-login">
          <label><span>Email</span><input name="email" type="email" autocomplete="email" required /></label>
          <label><span>Password</span><input name="password" type="password" autocomplete="current-password" required /></label>
          <button class="primary-button" type="submit">Sign in with email</button>
        </form>
        <div class="login-divider"><span>or</span></div>
        <button class="outline-button google-button" id="import-google-login">Continue with Google</button>
        <div id="import-login-status" class="import-status">Use the same account you will use for the dashboard.</div>`;
      document.querySelector("#import-google-login").addEventListener("click", () => signInWithPopup(auth, new GoogleAuthProvider()));
      document.querySelector("#import-email-login").addEventListener("submit", async (event) => {
        event.preventDefault();
        const values = new FormData(event.target);
        const status = document.querySelector("#import-login-status");
        try {
          await signInWithEmailAndPassword(
            auth,
            String(values.get("email") ?? "").trim(),
            String(values.get("password") ?? "")
          );
        } catch (error) {
          console.error(error);
          status.textContent = "Check your email and password, then try again.";
        }
      });
      return;
    }

    root.innerHTML = `
      <div class="signed-in-line"><span class="avatar-button">${(user.displayName || user.email || "C").slice(0, 1).toUpperCase()}</span><span><strong>Signed in</strong><small>${user.email ?? "Google account"}</small></span></div>
      <label class="file-drop"><span>Choose Clairy HQ backup</span><input id="backup-file" type="file" accept="application/json,.json" /></label>
      <button class="primary-button" id="run-import" disabled>Import tasks and progress</button>
      <div id="import-status" class="import-status">Nothing has been imported yet.</div>`;

    let payload = null;
    const fileInput = document.querySelector("#backup-file");
    const importButton = document.querySelector("#run-import");
    const status = document.querySelector("#import-status");

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        payload = JSON.parse(await file.text());
        if (!Array.isArray(payload.tasks) || !Array.isArray(payload.logs)) throw new Error("This is not a Clairy HQ migration file.");
        importButton.disabled = false;
        status.textContent = `Ready to import ${payload.tasks.length} tasks and ${payload.logs.length} progress records.`;
      } catch (error) {
        payload = null;
        importButton.disabled = true;
        status.textContent = error.message;
      }
    });

    importButton.addEventListener("click", async () => {
      if (!payload) return;
      importButton.disabled = true;
      status.textContent = "Importing…";
      try {
        const writes = [
          ...payload.tasks.map((task) => ({
            ref: doc(db, "users", user.uid, "tasks", String(task.id)),
            data: { ...task, id: String(task.id) }
          })),
          ...payload.logs.map((log) => ({
            ref: doc(db, "users", user.uid, "logs", `${log.task_id}_${log.log_date}`),
            data: { ...log, task_id: String(log.task_id) }
          }))
        ];

        for (let offset = 0; offset < writes.length; offset += 400) {
          const batch = writeBatch(db);
          for (const write of writes.slice(offset, offset + 400)) batch.set(write.ref, write.data, { merge: true });
          await batch.commit();
        }

        status.innerHTML = `<strong>Import complete.</strong><br>${payload.tasks.length} tasks and ${payload.logs.length} progress records are now synced.`;
        setTimeout(() => window.location.assign("./"), 1400);
      } catch (error) {
        console.error(error);
        status.textContent = `Import failed: ${error.message}`;
        importButton.disabled = false;
      }
    });
  });
}
