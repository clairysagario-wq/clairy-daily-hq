import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const root = document.querySelector("#app");
const configured = !Object.values(firebaseConfig).some((value) => String(value).startsWith("REPLACE_WITH_"));

let auth;
let db;
let user = null;
let tasks = [];
let logs = [];
let invoices = [];
let selectedDate = manilaDate();
let activeTab = "work";
let clientFilter = "All";
let invoiceFilter = "All";
let invoiceDraft = null;
let unsubTasks = null;
let unsubLogs = null;
let unsubInvoices = null;
let loadingData = true;
let message = "";

if (!configured) {
  renderSetup();
} else {
  const firebaseApp = initializeApp(firebaseConfig);
  auth = getAuth(firebaseApp);
  db = getFirestore(firebaseApp);
  setPersistence(auth, browserLocalPersistence).finally(() => {
    onAuthStateChanged(auth, handleAuth);
  });
}

function manilaDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function shiftDate(value, amount) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function prettyDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date(`${value}T12:00:00Z`));
}

function shortDate(value) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })
    .format(new Date(`${value}T12:00:00Z`));
}

function mondayFor(value) {
  const date = new Date(`${value}T12:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date.toISOString().slice(0, 10);
}

function sundayFor(value) {
  return shiftDate(mondayFor(value), 6);
}

function isWeekend(value) {
  const day = new Date(`${value}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function taskPath(taskId) {
  return doc(db, "users", user.uid, "tasks", String(taskId));
}

function logPath(taskId, date) {
  return doc(db, "users", user.uid, "logs", `${taskId}_${date}`);
}

function invoicePath(invoiceId) {
  return doc(db, "users", user.uid, "invoices", String(invoiceId));
}

async function handleAuth(nextUser) {
  user = nextUser;
  if (!user) {
    stopSubscriptions();
    renderLogin();
    return;
  }

  loadingData = true;
  render();
  const taskCollection = collection(db, "users", user.uid, "tasks");
  const logCollection = collection(db, "users", user.uid, "logs");
  const invoiceCollection = collection(db, "users", user.uid, "invoices");
  unsubTasks = onSnapshot(taskCollection, (snapshot) => {
    tasks = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    tasks.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    loadingData = false;
    render();
  }, showDataError);
  unsubLogs = onSnapshot(logCollection, (snapshot) => {
    logs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    loadingData = false;
    render();
  }, showDataError);
  unsubInvoices = onSnapshot(invoiceCollection, (snapshot) => {
    invoices = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    invoices.sort((a, b) => String(b.invoice_date ?? b.created_at ?? "").localeCompare(String(a.invoice_date ?? a.created_at ?? "")));
    loadingData = false;
    if (activeTab === "invoices" && !invoiceDraft) render();
  }, showDataError);
}

function stopSubscriptions() {
  if (unsubTasks) unsubTasks();
  if (unsubLogs) unsubLogs();
  if (unsubInvoices) unsubInvoices();
  unsubTasks = null;
  unsubLogs = null;
  unsubInvoices = null;
  tasks = [];
  logs = [];
  invoices = [];
}

function showDataError(error) {
  loadingData = false;
  message = `The dashboard could not sync: ${error.message}`;
  render();
}

function renderSetup() {
  root.innerHTML = `
    <main class="center-shell">
      <section class="gate-card">
        <div class="brand-mark">✦</div>
        <p class="eyebrow">Clairy Daily HQ</p>
        <h1>Ready for free hosting</h1>
        <p>The dashboard package is complete. Add the Firebase web configuration to <code>firebase-config.js</code>, then deploy.</p>
      </section>
    </main>`;
}

function renderLogin() {
  root.innerHTML = `
    <main class="center-shell">
      <section class="gate-card">
        <div class="brand-mark">✦</div>
        <p class="eyebrow">Clairy Daily HQ</p>
        <h1>Good work, gently organized.</h1>
        <p>Sign in to open your private, synced dashboard.</p>
        <form class="login-form" id="email-login-form">
          <label><span>Email</span><input name="email" type="email" autocomplete="email" required /></label>
          <label><span>Password</span><input name="password" type="password" autocomplete="current-password" required /></label>
          <button class="primary-button" type="submit">Sign in with email</button>
        </form>
        <div class="login-divider"><span>or</span></div>
        <button class="outline-button google-button" data-action="login-google">Continue with Google</button>
        <small>Your tasks are stored under your Google account and are not visible to other users.</small>
      </section>
    </main>`;
}

function isScheduled(task, date) {
  const current = new Date(`${date}T12:00:00Z`);
  const dayOfWeek = current.getUTCDay();
  const dayOfMonth = current.getUTCDate();
  const schedule = String(task.schedule_days ?? "").split(",").filter(Boolean).map(Number);
  const recurring = task.frequency !== "once";

  if ((dayOfWeek === 0 || dayOfWeek === 6) && task.client !== "Side Quest" && recurring) return false;
  if (task.frequency === "daily" || task.frequency === "anytime") return true;
  if (task.frequency === "weekly") return schedule.includes(dayOfWeek);
  if (task.frequency === "twice_monthly" || task.frequency === "monthly") return schedule.includes(dayOfMonth);
  return task.frequency === "once" && Boolean(task.due_date && task.due_date <= date);
}

function latestLog(taskId, date) {
  return logs
    .filter((log) => String(log.task_id) === String(taskId) && log.log_date <= date)
    .sort((a, b) => b.log_date.localeCompare(a.log_date))[0] ?? null;
}


function noteHistoryForTask(taskId, date = selectedDate) {
  const entries = [];
  const seen = new Set();
  const taskLogs = logs
    .filter((log) => String(log.task_id) === String(taskId) && log.log_date <= date)
    .sort((a, b) => String(a.log_date).localeCompare(String(b.log_date)));

  for (const log of taskLogs) {
    const updates = Array.isArray(log.note_updates) ? log.note_updates : [];
    if (updates.length) {
      for (const update of updates) {
        const text = String(update?.text ?? "").trim();
        if (!text) continue;
        const key = text.replace(/\s+/g, " ").toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({
          text,
          log_date: log.log_date,
          created_at: update?.created_at ?? log.updated_at ?? null
        });
      }
      continue;
    }

    const legacy = String(log.note ?? "").trim();
    if (!legacy) continue;
    const key = legacy.replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      text: legacy,
      log_date: log.log_date,
      created_at: log.updated_at ?? null
    });
  }

  return entries.sort((a, b) => {
    const left = String(a.created_at ?? a.log_date ?? "");
    const right = String(b.created_at ?? b.log_date ?? "");
    return left.localeCompare(right);
  });
}

function noteStamp(entry) {
  if (entry.created_at) {
    const date = new Date(entry.created_at);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }).format(date);
    }
  }
  return shortDate(entry.log_date);
}

function dashboardItems() {
  return tasks.flatMap((task) => {
    if (task.active === false || task.active === 0) return [];
    const latest = latestLog(task.id, selectedDate);
    const scheduledToday = isScheduled(task, selectedDate);
    const loggedToday = latest?.log_date === selectedDate;
    const completedEarlier = latest?.status === "done" && !loggedToday;
    const unfinishedEarlier = Boolean(latest && latest.log_date < selectedDate && latest.status !== "done");
    let visible = Boolean(task.is_urgent) || scheduledToday || unfinishedEarlier;
    if (task.frequency === "once" && completedEarlier) visible = false;
    if (task.frequency === "once" && latest && latest.status !== "done") visible = true;
    if (!visible) return [];

    const reset = scheduledToday && completedEarlier && task.frequency !== "once";
    const status = loggedToday ? latest.status : reset || !latest ? "todo" : latest.status;
    const noteHistory = noteHistoryForTask(task.id, selectedDate);
    const note = noteHistory.length ? noteHistory[noteHistory.length - 1].text : "";
    const section = ["daily", "weekly", "twice_monthly", "monthly"].includes(task.frequency)
      ? "core"
      : task.frequency === "anytime" ? "anytime" : "current";
    return [{ ...task, status, note, noteHistory, carried: unfinishedEarlier, section }];
  });
}

function sortTasks(items) {
  return [...items].sort((a, b) => {
    const aDone = a.status === "done";
    const bDone = b.status === "done";
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (Boolean(a.is_urgent) !== Boolean(b.is_urgent)) return a.is_urgent ? -1 : 1;
    if (a.carried !== b.carried) return a.carried ? -1 : 1;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
}

function render() {
  if (!user) return renderLogin();
  const items = dashboardItems();
  const work = items.filter((task) => task.client !== "Side Quest" && (clientFilter === "All" || task.client === clientFilter));
  const quests = items.filter((task) => task.client === "Side Quest");
  const core = work.filter((task) => task.section === "core");
  const completedCore = core.filter((task) => task.status === "done").length;
  const progress = core.length ? Math.round(completedCore / core.length * 100) : 0;
  const openCore = sortTasks(work.filter((task) => task.section === "core" && task.status !== "done"));
  const openCurrent = sortTasks(work.filter((task) => task.section === "current" && task.status !== "done"));
  const openAnytime = sortTasks(work.filter((task) => task.section === "anytime" && task.status !== "done"));
  const completedWork = sortTasks(work.filter((task) => task.status === "done"));
  const openQuests = sortTasks(quests.filter((task) => task.status !== "done"));
  const completedQuests = sortTasks(quests.filter((task) => task.status === "done"));

  root.innerHTML = `
    <main class="app-shell">
      <div class="ambient ambient-one"></div><div class="ambient ambient-two"></div>
      <div class="dashboard-wrap">
        <header class="topbar">
          <div class="brand-mark">✦</div>
          <div><p class="eyebrow">Clairy Daily HQ</p><h1>Good work, gently organized.</h1></div>
          <div class="header-actions">
            <div class="date-nav">
              <button class="icon-button" data-action="previous-date" aria-label="Previous day">‹</button>
              <button class="date-button" data-action="today"><span>▣</span><span><strong>${esc(prettyDate(selectedDate))}</strong><small>Philippine time</small></span></button>
              <button class="icon-button" data-action="next-date" aria-label="Next day">›</button>
            </div>
            <button class="avatar-button" data-action="signout" title="Sign out">${esc((user.displayName || user.email || "C").slice(0, 1).toUpperCase())}</button>
          </div>
        </header>

        <nav class="main-tabs" aria-label="Dashboard areas">
          <button class="${activeTab === "work" ? "active" : ""}" data-tab="work">✓ Work Day</button>
          <button class="${activeTab === "quests" ? "active" : ""}" data-tab="quests">✦ Side Quests</button>
          <button class="${activeTab === "invoices" ? "active" : ""}" data-tab="invoices">▤ Invoices</button>
        </nav>

        ${message ? `<div class="alert">${esc(message)}</div>` : ""}
        ${loadingData ? `<div class="loading-card"><span class="spinner">◌</span><p>Syncing your dashboard…</p></div>` : activeTab === "work" ? `
          <section class="overview-grid">
            <div class="focus-card">
              <div class="focus-copy"><span class="mini-label">Today’s rhythm</span><h2>${completedCore} of ${core.length} core tasks complete</h2><p>Your unfinished notes stay attached, so tomorrow starts where today ended.</p><div class="progress"><span style="width:${progress}%"></span></div></div>
              <div class="progress-orbit" style="--progress:${progress * 3.6}deg"><div><strong>${progress}%</strong><span>done</span></div></div>
            </div>
            ${statCard("✓", completedWork.length, "finished today")}
            ${statCard("◷", work.filter((task) => task.status === "in_progress").length, "in progress")}
            ${statCard("☕", work.filter((task) => task.status === "waiting").length, "waiting / follow-up")}
          </section>
          <div class="task-toolbar">
            <nav class="client-filter">${["All", "Elicra", "OBB"].map((name) => `<button class="${clientFilter === name ? "active" : ""}" data-client="${name}">${name}</button>`).join("")}</nav>
            <div class="toolbar-actions"><button class="outline-button" data-action="scroll-weekly">♕ Weekly recap</button><button class="primary-button" data-action="open-add">＋ Add task</button></div>
          </div>
          ${isWeekend(selectedDate) ? `<div class="weekend-note">☕ <span><strong>Weekend mode</strong>Fresh recurring client tasks are resting. Carryovers, one-time work, and urgent items still appear.</span></div>` : ""}
          ${sectionHtml("Daily checklist", "The recurring work that keeps both clients current.", openCore)}
          ${sectionHtml("Carryovers & current work", "Projects, follow-ups, and waiting items that need continuity.", openCurrent)}
          ${sectionHtml("When needed", "Visible when useful, without counting against core progress.", openAnytime)}
          ${!openCore.length && !openCurrent.length && !openAnytime.length && !completedWork.length ? emptyHtml("Nothing scheduled here.", "Try another client or date.") : ""}
          ${sectionHtml("Completed today", "Checked items move here automatically, keeping unfinished work first.", completedWork)}
          ${weeklyHtml(items)}
        ` : activeTab === "quests" ? `
          <section class="quest-overview"><div><span class="mini-label">Optional growth time</span><h2>Choose what feels useful today.</h2><p>Side Quests never count against your client-work checklist. One focused lesson or small build is already a win.</p></div><div class="quest-score"><strong>${completedQuests.length}</strong><span>completed today</span></div></section>
          <div class="task-toolbar quest-toolbar"><p>✦ Learn it, then turn it into a report, tool, checklist, or portfolio example.</p><div class="toolbar-actions"><button class="outline-button" data-action="scroll-quests">♕ Quest wins</button><button class="primary-button" data-action="open-add">＋ Add Side Quest</button></div></div>
          ${sectionHtml("Today’s Side Quests", "Pick one—or none. These are possibilities, not obligations.", openQuests)}
          ${sectionHtml("Completed Side Quests", "Today’s learning wins, moved out of your way.", completedQuests)}
          ${questAchievementsHtml()}
        ` : invoiceHtml()}
      </div>
      ${addDialogHtml()}
      <div id="toast" class="toast" role="status"></div>
    </main>`;
  requestAnimationFrame(autoExpandVisibleNotes);
}

function statCard(icon, count, label) {
  return `<div class="soft-stat"><span class="stat-icon">${icon}</span><span><strong>${count}</strong>${esc(label)}</span></div>`;
}

function sectionHtml(title, subtitle, items) {
  if (!items.length) return "";
  return `<section class="task-section"><div class="section-heading"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div><span>${items.length} ${items.length === 1 ? "task" : "tasks"}</span></div><div class="task-list">${items.map(taskCardHtml).join("")}</div></section>`;
}

function taskCardHtml(task) {
  const clientClass = task.client.toLowerCase().replaceAll(" ", "-");
  const done = task.status === "done";
  return `<article class="task-card ${done ? "task-card-done" : ""} ${task.is_urgent ? "task-card-urgent" : ""}" data-task-card="${esc(task.id)}">
    <div class="task-main">
      <button class="task-check ${done ? "checked" : ""}" data-action="toggle-done" data-task="${esc(task.id)}" aria-label="${done ? "Reopen" : "Complete"} ${esc(task.title)}">${done ? "✓" : ""}</button>
      <div class="task-copy"><div class="task-badges"><span class="client-badge client-${clientClass}">${esc(task.client)}</span><span>${esc(task.category)}</span>${task.is_urgent ? `<span class="urgent-badge">♨ Urgent</span>` : ""}${task.carried ? `<span class="carry-badge">↻ Carried over</span>` : ""}</div><h3>${esc(task.title)}</h3><p>${esc(task.default_note)}</p>${task.blocked_by ? `<p class="blocked-line">Waiting on: ${esc(task.blocked_by)}</p>` : ""}</div>
      <div class="task-actions"><button class="urgent-button ${task.is_urgent ? "active" : ""}" data-action="toggle-urgent" data-task="${esc(task.id)}" ${done ? "disabled" : ""}>♨ ${task.is_urgent ? "Urgent" : "Flag urgent"}</button><select class="status-select status-${esc(task.status)}" data-action="status" data-task="${esc(task.id)}"><option value="todo" ${task.status === "todo" ? "selected" : ""}>To do</option><option value="in_progress" ${task.status === "in_progress" ? "selected" : ""}>Working on it</option><option value="waiting" ${task.status === "waiting" ? "selected" : ""}>Waiting</option><option value="done" ${done ? "selected" : ""}>Done</option></select></div>
    </div>
    ${task.noteHistory?.length ? `<div class="note-history">${task.noteHistory.map((entry) => `<div class="note-update"><span>${esc(noteStamp(entry))}</span><p>${esc(entry.text)}</p></div>`).join("")}</div>` : ""}
    <div class="note-row"><textarea data-note="${esc(task.id)}" rows="1" placeholder="Add a new update…"></textarea><button class="outline-button small" data-action="save-note" data-task="${esc(task.id)}">Save update</button></div>
  </article>`;
}

function weeklyEntries(client) {
  const start = mondayFor(selectedDate);
  const end = sundayFor(selectedDate);
  return logs.filter((log) => log.log_date >= start && log.log_date <= end && taskById(log.task_id)?.client === client);
}

function completedSummary(client) {
  const map = new Map();
  for (const log of weeklyEntries(client).filter((entry) => entry.status === "done")) {
    const task = taskById(log.task_id);
    if (!task) continue;
    const current = map.get(String(task.id));
    map.set(String(task.id), { title: task.title, count: (current?.count ?? 0) + 1 });
  }
  return [...map.values()];
}

function weeklyHtml(items) {
  const cards = ["OBB", "Elicra"].map((client) => {
    const completed = completedSummary(client);
    const open = items.filter((task) => task.client === client && task.section === "current" && task.status !== "done");
    return `<article class="recap-card recap-${client.toLowerCase()}"><div class="recap-title-row"><div><span class="client-badge client-${client.toLowerCase()}">${client}</span><h3>${client === "OBB" ? "OBB Weekly Update" : "Elicra Monday Recap"}</h3></div><button class="outline-button small" data-action="copy-recap" data-client-copy="${client}">▣ Copy recap</button></div><div class="achievement-block"><h4>Completed this week</h4>${completed.length ? `<ul>${completed.map((item) => `<li>✓ <span>${esc(item.title)}${item.count > 1 ? `<small>${item.count} days</small>` : ""}</span></li>`).join("")}</ul>` : `<p class="recap-empty">Your completed tasks will appear here.</p>`}</div><div class="recap-counts"><span><strong>${open.filter((task) => task.status !== "waiting").length}</strong> in progress / next</span><span><strong>${open.filter((task) => task.status === "waiting").length}</strong> waiting</span></div></article>`;
  }).join("");
  return `<section class="weekly-section" id="weekly-recap"><div class="weekly-heading"><div><span class="mini-label">Automatically built from your checkmarks</span><h2>Weekly achievements</h2><p>${shortDate(mondayFor(selectedDate))}–${shortDate(sundayFor(selectedDate))} · Ready for OBB’s Friday update and Elicra’s Monday meeting.</p></div><span class="heading-icon">♕</span></div><div class="recap-grid">${cards}</div></section>`;
}

function questAchievementsHtml() {
  const completed = completedSummary("Side Quest");
  const count = completed.reduce((sum, item) => sum + item.count, 0);
  return `<section class="weekly-section quest-achievements" id="side-quest-wins"><div class="weekly-heading"><div><span class="mini-label">Your growth, counted separately</span><h2>Side Quest achievements</h2><p>${shortDate(mondayFor(selectedDate))}–${shortDate(sundayFor(selectedDate))} · Learning, building, and career progress.</p></div><span class="heading-icon">✦</span></div><article class="recap-card recap-quests"><div class="recap-title-row"><div><span class="client-badge client-side-quest">Side Quests</span><h3>${count} ${count === 1 ? "win" : "wins"} this week</h3></div><button class="outline-button small" data-action="copy-quests">▣ Copy summary</button></div><div class="achievement-block"><h4>Completed learning & projects</h4>${completed.length ? `<ul>${completed.map((item) => `<li>✓ <span>${esc(item.title)}${item.count > 1 ? `<small>${item.count} sessions</small>` : ""}</span></li>`).join("")}</ul>` : `<p class="recap-empty">Your completed Side Quests will appear here.</p>`}</div></article></section>`;
}


function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function invoiceNumberFor(client) {
  const year = new Date(`${selectedDate}T12:00:00Z`).getUTCFullYear();
  const count = invoices.filter((item) => item.client === client).length + 1;
  const prefix = client === "Elicra" ? "ELI" : "OBB";
  return `${prefix}-${year}-${String(count).padStart(3, "0")}`;
}

function newInvoiceDraft(client) {
  return {
    id: `invoice_${Date.now()}`,
    client,
    invoice_number: invoiceNumberFor(client),
    invoice_date: selectedDate,
    period_start: "",
    period_end: "",
    status: "Draft",
    rate: client === "Elicra" ? 7 : null,
    amount: client === "OBB" ? "" : null,
    description: client === "OBB" ? "Bookkeeping and administrative services" : "",
    notes: "Thank you!",
    work_rows: client === "Elicra" ? [{ date: "", hours: "", description: "" }] : []
  };
}

function invoiceTotals(invoice) {
  if (invoice.client === "OBB") {
    return { hours: null, amount: Number(invoice.amount || 0) };
  }
  const hours = (invoice.work_rows || []).reduce((sum, row) => sum + Number(row.hours || 0), 0);
  return { hours, amount: hours * Number(invoice.rate || 0) };
}

function captureInvoiceForm() {
  const form = document.querySelector("#invoice-form");
  if (!form || !invoiceDraft) return invoiceDraft;
  const data = new FormData(form);
  invoiceDraft = {
    ...invoiceDraft,
    invoice_number: String(data.get("invoice_number") ?? "").trim(),
    invoice_date: String(data.get("invoice_date") ?? ""),
    period_start: String(data.get("period_start") ?? ""),
    period_end: String(data.get("period_end") ?? ""),
    status: String(data.get("status") ?? "Draft"),
    notes: String(data.get("notes") ?? "").trim()
  };

  if (invoiceDraft.client === "Elicra") {
    invoiceDraft.rate = Number(data.get("rate") || 0);
    const dates = data.getAll("work_date");
    const hours = data.getAll("work_hours");
    const descriptions = data.getAll("work_description");
    invoiceDraft.work_rows = dates.map((date, index) => ({
      date: String(date ?? ""),
      hours: String(hours[index] ?? ""),
      description: String(descriptions[index] ?? "").trim()
    }));
  } else {
    invoiceDraft.amount = String(data.get("amount") ?? "");
    invoiceDraft.description = String(data.get("description") ?? "").trim();
  }
  return invoiceDraft;
}

function invoiceEditorHtml() {
  if (!invoiceDraft) return "";
  const draft = invoiceDraft;
  const totals = invoiceTotals(draft);
  return `<section class="invoice-editor-card">
    <div class="invoice-editor-heading">
      <div><span class="mini-label">${draft.id && invoices.some((item) => item.id === draft.id) ? "Edit saved invoice" : "New invoice"}</span><h2>${esc(draft.client)} invoice</h2><p>Everything is editable before you save it.</p></div>
      <button class="icon-button" data-action="cancel-invoice" aria-label="Close invoice editor">×</button>
    </div>
    <form id="invoice-form" class="invoice-form">
      <div class="invoice-form-grid">
        <label><span>Invoice #</span><input name="invoice_number" value="${esc(draft.invoice_number)}" required /></label>
        <label><span>Invoice date</span><input name="invoice_date" type="date" value="${esc(draft.invoice_date)}" required /></label>
        <label><span>Period start</span><input name="period_start" type="date" value="${esc(draft.period_start)}" /></label>
        <label><span>Period end</span><input name="period_end" type="date" value="${esc(draft.period_end)}" /></label>
        <label><span>Status</span><select name="status">${["Draft","Sent","Paid"].map((value) => `<option ${draft.status === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
      </div>

      ${draft.client === "Elicra" ? `
        <div class="invoice-work-head">
          <div><h3>Daily work hours</h3><p>These rows support the invoice total.</p></div>
          <label class="rate-field"><span>Hourly rate</span><input name="rate" type="number" min="0" step="0.01" value="${esc(draft.rate ?? 7)}" data-invoice-calc /></label>
        </div>
        <div class="invoice-work-list">
          ${(draft.work_rows || []).map((row, index) => `<div class="invoice-work-row">
            <input name="work_date" type="date" value="${esc(row.date)}" aria-label="Work date" />
            <input name="work_hours" type="number" min="0" step="0.01" value="${esc(row.hours)}" placeholder="Hours" aria-label="Hours" data-invoice-calc />
            <input name="work_description" value="${esc(row.description)}" placeholder="Description / work completed" aria-label="Description" />
            <button class="icon-button invoice-remove-row" type="button" data-action="remove-invoice-row" data-row="${index}" aria-label="Remove row">×</button>
          </div>`).join("")}
        </div>
        <button class="outline-button small invoice-add-row" type="button" data-action="add-invoice-row">＋ Add work day</button>
        <div class="invoice-live-total"><span>Total hours <strong data-invoice-hours>${totals.hours.toFixed(2)}</strong></span><span>Invoice total <strong data-invoice-total>${money(totals.amount)}</strong></span></div>
      ` : `
        <div class="invoice-form-grid">
          <label class="span-two"><span>Description</span><input name="description" value="${esc(draft.description ?? "")}" /></label>
          <label><span>Total amount</span><input name="amount" type="number" min="0" step="0.01" value="${esc(draft.amount ?? "")}" required data-invoice-calc /></label>
        </div>
        <div class="invoice-live-total"><span>Invoice total <strong data-invoice-total>${money(totals.amount)}</strong></span></div>
      `}

      <label class="invoice-notes-label"><span>Invoice note</span><textarea name="notes" rows="2">${esc(draft.notes ?? "")}</textarea></label>
      <div class="invoice-editor-actions"><button class="outline-button" type="button" data-action="cancel-invoice">Cancel</button><button class="primary-button" type="submit">Save invoice</button></div>
    </form>
  </section>`;
}

function invoiceHistoryHtml() {
  const filtered = invoices.filter((invoice) => invoiceFilter === "All" || invoice.client === invoiceFilter);
  if (!filtered.length) {
    return `<div class="empty-card invoice-empty"><span>▤</span><h2>No saved invoices yet.</h2><p>Your Elicra and OBB invoices will stay here after you save them.</p></div>`;
  }

  return `<div class="invoice-history-list">${filtered.map((invoice) => {
    const totals = invoiceTotals(invoice);
    const period = invoice.period_start || invoice.period_end
      ? `${invoice.period_start ? shortDate(invoice.period_start) : "—"}–${invoice.period_end ? shortDate(invoice.period_end) : "—"}`
      : "No period set";
    return `<article class="invoice-history-card">
      <div class="invoice-history-main">
        <div class="invoice-history-title"><span class="client-badge client-${invoice.client.toLowerCase()}">${esc(invoice.client)}</span><div><h3>${esc(invoice.invoice_number || "Invoice")}</h3><p>${esc(period)} · ${esc(invoice.status || "Draft")}</p></div></div>
        <div class="invoice-history-total">${invoice.client === "Elicra" ? `<small>${Number(totals.hours || 0).toFixed(2)} hrs</small>` : ""}<strong>${money(totals.amount)}</strong></div>
      </div>
      <div class="invoice-history-actions">
        <button class="outline-button small" data-action="edit-invoice" data-invoice="${esc(invoice.id)}">Edit</button>
        <button class="outline-button small" data-action="duplicate-invoice" data-invoice="${esc(invoice.id)}">Duplicate</button>
        <button class="primary-button small" data-action="print-invoice" data-invoice="${esc(invoice.id)}">Print / Save PDF</button>
      </div>
    </article>`;
  }).join("")}</div>`;
}

function invoiceHtml() {
  return `<section class="invoice-overview">
    <div><span class="mini-label">Saved with your private Firebase account</span><h2>Invoice tracker</h2><p>Create, edit, reuse, and pull up previous invoices for Elicra and OBB.</p></div>
    <div class="invoice-new-actions"><button class="outline-button" data-action="new-invoice" data-invoice-client="Elicra">＋ Elicra invoice</button><button class="primary-button" data-action="new-invoice" data-invoice-client="OBB">＋ OBB invoice</button></div>
  </section>
  ${invoiceEditorHtml()}
  <section class="invoice-history-section">
    <div class="section-heading"><div><h2>Saved invoices</h2><p>Elicra keeps daily hour support; OBB keeps the total amount.</p></div><nav class="client-filter invoice-filter">${["All","Elicra","OBB"].map((name) => `<button class="${invoiceFilter === name ? "active" : ""}" data-invoice-filter="${name}">${name}</button>`).join("")}</nav></div>
    ${invoiceHistoryHtml()}
  </section>`;
}

async function saveInvoiceFromForm() {
  const draft = captureInvoiceForm();
  if (!draft) return;
  const form = document.querySelector("#invoice-form");
  if (!form?.reportValidity()) return;

  if (draft.client === "Elicra") {
    draft.work_rows = (draft.work_rows || []).filter((row) => row.date || row.hours || row.description);
  }

  const totals = invoiceTotals(draft);
  const now = new Date().toISOString();
  await setDoc(invoicePath(draft.id), {
    ...draft,
    total_hours: totals.hours,
    total_amount: totals.amount,
    updated_at: now,
    created_at: draft.created_at ?? invoices.find((item) => item.id === draft.id)?.created_at ?? now
  }, { merge: true });

  invoiceDraft = null;
  toast("Invoice saved");
}

function printInvoice(invoice) {
  const totals = invoiceTotals(invoice);
  const popup = window.open("", "_blank");
  if (!popup) {
    toast("Please allow pop-ups to print the invoice");
    return;
  }

  const workRows = invoice.client === "Elicra" ? `
    <table>
      <thead><tr><th>Date</th><th>Description</th><th class="right">Hours</th></tr></thead>
      <tbody>${(invoice.work_rows || []).filter((row) => row.date || row.hours || row.description).map((row) => `<tr><td>${esc(row.date || "")}</td><td>${esc(row.description || "")}</td><td class="right">${Number(row.hours || 0).toFixed(2)}</td></tr>`).join("")}</tbody>
    </table>
    <div class="summary"><span>Total hours</span><strong>${Number(totals.hours || 0).toFixed(2)}</strong></div>
    <div class="summary"><span>Hourly rate</span><strong>${money(invoice.rate || 0)}</strong></div>` : `
    <p class="service">${esc(invoice.description || "Bookkeeping and administrative services")}</p>`;

  popup.document.write(`<!doctype html><html><head><meta charset="UTF-8"><title>${esc(invoice.invoice_number || "Invoice")}</title><style>
    *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#302a34;margin:0;padding:42px} .sheet{max-width:820px;margin:auto}
    .top{display:flex;justify-content:space-between;gap:28px;align-items:flex-start;border-bottom:2px solid #88739c;padding-bottom:24px;margin-bottom:30px}
    h1{margin:0;font-size:38px;letter-spacing:-1px}.brand{font-size:18px;font-weight:700;color:#69567b}.meta{text-align:right;font-size:13px;line-height:1.8}
    .bill{margin-bottom:26px}.bill small,.summary span{color:#716976}.bill strong{display:block;font-size:20px;margin-top:4px}
    table{width:100%;border-collapse:collapse;margin:22px 0}th,td{padding:12px 10px;border-bottom:1px solid #e4dfe7;text-align:left;font-size:13px}.right{text-align:right}
    .summary{display:flex;justify-content:flex-end;gap:28px;margin:9px 0;font-size:14px}.summary strong{min-width:100px;text-align:right}
    .total{margin-top:18px;padding-top:14px;border-top:2px solid #88739c;font-size:21px}.service{padding:18px;border:1px solid #e4dfe7;border-radius:12px;background:#fbf9fb}
    .note{margin-top:34px;color:#716976;font-size:13px}.print{margin-top:28px;padding:12px 18px;border:0;border-radius:9px;background:#88739c;color:white;font-weight:700;cursor:pointer}
    @media print{body{padding:0}.print{display:none}}
  </style></head><body><div class="sheet">
    <div class="top"><div><div class="brand">Clairy Sagario</div><h1>INVOICE</h1></div><div class="meta"><strong>${esc(invoice.invoice_number || "")}</strong><br>Invoice date: ${esc(invoice.invoice_date || "")}<br>${invoice.period_start || invoice.period_end ? `Period: ${esc(invoice.period_start || "—")} to ${esc(invoice.period_end || "—")}` : ""}</div></div>
    <div class="bill"><small>BILL TO</small><strong>${invoice.client === "Elicra" ? "Elicra Investments LLC" : "Online Biz Builders LLC"}</strong></div>
    ${workRows}
    <div class="summary total"><span>Total due</span><strong>${money(totals.amount)}</strong></div>
    ${invoice.notes ? `<p class="note">${esc(invoice.notes)}</p>` : ""}
    <button class="print" onclick="window.print()">Print / Save as PDF</button>
  </div></body></html>`);
  popup.document.close();
}

function refreshInvoiceTotals() {
  const form = document.querySelector("#invoice-form");
  if (!form || !invoiceDraft) return;
  const data = new FormData(form);
  let amount = 0;
  let hours = null;
  if (invoiceDraft.client === "Elicra") {
    hours = data.getAll("work_hours").reduce((sum, value) => sum + Number(value || 0), 0);
    amount = hours * Number(data.get("rate") || 0);
  } else {
    amount = Number(data.get("amount") || 0);
  }
  const hoursNode = document.querySelector("[data-invoice-hours]");
  const totalNode = document.querySelector("[data-invoice-total]");
  if (hoursNode && hours !== null) hoursNode.textContent = hours.toFixed(2);
  if (totalNode) totalNode.textContent = money(amount);
}

function autoExpandTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.max(40, textarea.scrollHeight)}px`;
}

function autoExpandVisibleNotes() {
  document.querySelectorAll("textarea[data-note]").forEach(autoExpandTextarea);
}

function addDialogHtml() {
  return `<dialog id="add-dialog"><form method="dialog" id="add-form"><div class="dialog-heading"><div><p class="eyebrow">${activeTab === "quests" ? "Optional growth" : "New work"}</p><h2>${activeTab === "quests" ? "Add a Side Quest" : `Add something for ${esc(prettyDate(selectedDate))}`}</h2></div><button class="icon-button" value="cancel" aria-label="Close">×</button></div><label><span>Task</span><input name="title" required placeholder="What needs to be done?" /></label>${activeTab === "work" ? `<label><span>Client</span><select name="client"><option>Elicra</option><option>OBB</option></select></label>` : ""}<label><span>Starting note <small>(optional)</small></span><textarea name="note" placeholder="Add the next step, blocker, or useful context…"></textarea></label><div class="dialog-actions"><button class="primary-button" value="default" data-action="submit-add">Add to today</button></div></form></dialog>`;
}

function emptyHtml(title, text) {
  return `<div class="empty-card"><span>✓</span><h2>${esc(title)}</h2><p>${esc(text)}</p></div>`;
}

function taskById(id) {
  return tasks.find((task) => String(task.id) === String(id));
}

function visibleItemById(id) {
  return dashboardItems().find((task) => String(task.id) === String(id));
}

async function saveLog(task, status) {
  const now = new Date().toISOString();
  await setDoc(logPath(task.id, selectedDate), {
    task_id: String(task.id),
    log_date: selectedDate,
    status,
    completed_at: status === "done" ? now : null,
    updated_at: now
  }, { merge: true });
  if (status === "done" && task.is_urgent) {
    await setDoc(taskPath(task.id), { is_urgent: false }, { merge: true });
  }
  toast(status === "done" ? "Added to this week’s wins" : "Progress saved");
}

async function appendNoteUpdate(task, text) {
  const clean = String(text ?? "").trim();
  if (!clean) {
    toast("Type an update first");
    return;
  }

  const allHistory = noteHistoryForTask(task.id, selectedDate);
  const normalized = clean.replace(/\s+/g, " ").toLowerCase();
  if (allHistory.some((entry) => entry.text.replace(/\s+/g, " ").toLowerCase() === normalized)) {
    toast("That update is already saved");
    return;
  }

  const todayLog = logs.find((log) => String(log.task_id) === String(task.id) && log.log_date === selectedDate);
  const existingUpdates = Array.isArray(todayLog?.note_updates) ? todayLog.note_updates : [];
  const now = new Date().toISOString();

  await setDoc(logPath(task.id, selectedDate), {
    task_id: String(task.id),
    log_date: selectedDate,
    status: task.status,
    note: clean,
    note_updates: [...existingUpdates, { text: clean, created_at: now }],
    updated_at: now
  }, { merge: true });

  toast("Update saved");
}

async function toggleUrgent(task) {
  await setDoc(taskPath(task.id), { is_urgent: !task.is_urgent }, { merge: true });
  toast(task.is_urgent ? "Urgent flag removed" : "Moved to the top of your checklist");
}

function recapText(client) {
  const completed = completedSummary(client);
  const items = dashboardItems();
  const open = items.filter((task) => task.client === client && task.section === "current" && task.status !== "done");
  const active = open.filter((task) => task.status !== "waiting");
  const waiting = open.filter((task) => task.status === "waiting");
  const bullets = (values, fallback, suffix = () => "") => values.length ? values.map((item) => `• ${item.title}${suffix(item)}`).join("\n") : `• ${fallback}`;
  return `${client === "OBB" ? "OBB Weekly Update" : "Elicra Monday Recap"} | ${shortDate(mondayFor(selectedDate))}–${shortDate(sundayFor(selectedDate))}\n\nCompleted:\n${bullets(completed, "No completed items recorded yet.", (item) => item.count > 1 ? ` (${item.count} days)` : "")}\n\nIn progress / next:\n${bullets(active, "No active project items.")}\n\nWaiting / follow-up:\n${bullets(waiting, "No waiting items.", (item) => item.blocked_by ? ` — waiting on ${item.blocked_by}` : "")}`;
}

function questText() {
  const completed = completedSummary("Side Quest");
  return `Side Quest Wins | ${shortDate(mondayFor(selectedDate))}–${shortDate(sundayFor(selectedDate))}\n\n${completed.length ? completed.map((item) => `• ${item.title}${item.count > 1 ? ` (${item.count} sessions)` : ""}`).join("\n") : "• No Side Quests completed yet."}`;
}

function toast(text) {
  const element = document.querySelector("#toast");
  if (!element) return;
  element.textContent = text;
  element.classList.add("show");
  setTimeout(() => element.classList.remove("show"), 2200);
}

root.addEventListener("click", async (event) => {
  const button = event.target.closest("button, [data-tab], [data-client], [data-invoice-filter]");
  if (!button) return;
  const action = button.dataset.action;

  try {
    if (action === "login-google") await signInWithPopup(auth, new GoogleAuthProvider());
    if (action === "signout") await signOut(auth);
    if (action === "previous-date") { selectedDate = shiftDate(selectedDate, -1); render(); }
    if (action === "next-date") { selectedDate = shiftDate(selectedDate, 1); render(); }
    if (action === "today") { selectedDate = manilaDate(); render(); }
    if (button.dataset.tab) {
      activeTab = button.dataset.tab;
      if (activeTab !== "invoices") invoiceDraft = null;
      render();
      requestAnimationFrame(autoExpandVisibleNotes);
    }
    if (button.dataset.client) { clientFilter = button.dataset.client; render(); requestAnimationFrame(autoExpandVisibleNotes); }
    if (button.dataset.invoiceFilter) { invoiceFilter = button.dataset.invoiceFilter; render(); }
    if (action === "toggle-done") {
      const task = visibleItemById(button.dataset.task);
      if (task) await saveLog(task, task.status === "done" ? "todo" : "done");
    }
    if (action === "toggle-urgent") {
      const task = taskById(button.dataset.task);
      if (task) await toggleUrgent(task);
    }
    if (action === "save-note") {
      const task = visibleItemById(button.dataset.task);
      const textarea = document.querySelector(`[data-note="${CSS.escape(button.dataset.task)}"]`);
      const note = textarea?.value ?? "";
      if (task) {
        await appendNoteUpdate(task, note);
        if (textarea) textarea.value = "";
      }
    }
    if (action === "open-add") document.querySelector("#add-dialog")?.showModal();
    if (action === "submit-add") {
      event.preventDefault();
      const form = document.querySelector("#add-form");
      if (!form.reportValidity()) return;
      const values = new FormData(form);
      const id = `custom_${Date.now()}`;
      const title = String(values.get("title") ?? "").trim();
      const note = String(values.get("note") ?? "").trim();
      await setDoc(taskPath(id), {
        id, title, client: activeTab === "quests" ? "Side Quest" : String(values.get("client") ?? "Elicra"),
        category: "Added by Clairy", frequency: "once", schedule_days: null,
        due_date: selectedDate, default_note: note, blocked_by: null,
        active: true, is_urgent: false, sort_order: Date.now(), created_at: new Date().toISOString()
      });
      document.querySelector("#add-dialog")?.close();
      toast(activeTab === "quests" ? "Side Quest added" : "Task added");
    }
    if (action === "new-invoice") {
      invoiceDraft = newInvoiceDraft(button.dataset.invoiceClient);
      render();
      document.querySelector(".invoice-editor-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (action === "cancel-invoice") {
      invoiceDraft = null;
      render();
    }
    if (action === "add-invoice-row") {
      captureInvoiceForm();
      invoiceDraft.work_rows = [...(invoiceDraft.work_rows || []), { date: "", hours: "", description: "" }];
      render();
      document.querySelector(".invoice-editor-card")?.scrollIntoView({ block: "start" });
    }
    if (action === "remove-invoice-row") {
      captureInvoiceForm();
      const index = Number(button.dataset.row);
      invoiceDraft.work_rows = (invoiceDraft.work_rows || []).filter((_, rowIndex) => rowIndex !== index);
      if (!invoiceDraft.work_rows.length) invoiceDraft.work_rows = [{ date: "", hours: "", description: "" }];
      render();
    }
    if (action === "edit-invoice") {
      const saved = invoices.find((item) => item.id === button.dataset.invoice);
      if (saved) {
        invoiceDraft = structuredClone(saved);
        render();
        document.querySelector(".invoice-editor-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    if (action === "duplicate-invoice") {
      const saved = invoices.find((item) => item.id === button.dataset.invoice);
      if (saved) {
        invoiceDraft = {
          ...structuredClone(saved),
          id: `invoice_${Date.now()}`,
          invoice_number: invoiceNumberFor(saved.client),
          invoice_date: selectedDate,
          status: "Draft",
          created_at: null,
          updated_at: null
        };
        render();
        document.querySelector(".invoice-editor-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    if (action === "print-invoice") {
      const saved = invoices.find((item) => item.id === button.dataset.invoice);
      if (saved) printInvoice(saved);
    }
    if (action === "scroll-weekly") document.querySelector("#weekly-recap")?.scrollIntoView({ behavior: "smooth" });
    if (action === "scroll-quests") document.querySelector("#side-quest-wins")?.scrollIntoView({ behavior: "smooth" });
    if (action === "copy-recap") { await navigator.clipboard.writeText(recapText(button.dataset.clientCopy)); toast("Recap copied"); }
    if (action === "copy-quests") { await navigator.clipboard.writeText(questText()); toast("Side Quest wins copied"); }
  } catch (error) {
    console.error(error);
    toast(error.code === "auth/popup-closed-by-user" ? "Sign-in window closed" : "That update could not be saved");
  }
});

root.addEventListener("submit", async (event) => {
  if (event.target.id === "invoice-form") {
    event.preventDefault();
    try { await saveInvoiceFromForm(); } catch (error) { console.error(error); toast("Invoice could not be saved"); }
    return;
  }
  if (event.target.id !== "email-login-form") return;
  event.preventDefault();
  const values = new FormData(event.target);
  const email = String(values.get("email") ?? "").trim();
  const password = String(values.get("password") ?? "");
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.error(error);
    message = "Check your email and password, then try again.";
    renderLogin();
    const card = document.querySelector(".gate-card");
    if (card) card.insertAdjacentHTML("afterbegin", `<div class="alert">${esc(message)}</div>`);
  }
});

root.addEventListener("input", (event) => {
  const noteBox = event.target.closest("textarea[data-note]");
  if (noteBox) autoExpandTextarea(noteBox);
  if (event.target.matches("[data-invoice-calc]")) refreshInvoiceTotals();
});

root.addEventListener("change", async (event) => {
  const select = event.target.closest('select[data-action="status"]');
  if (!select) return;
  const task = visibleItemById(select.dataset.task);
  if (!task) return;
  try { await saveLog(task, select.value); } catch (error) { console.error(error); toast("Progress could not be saved"); }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
