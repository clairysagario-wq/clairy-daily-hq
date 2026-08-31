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
let selectedDate = manilaDate();
let activeTab = "work";
let clientFilter = "All";
let unsubTasks = null;
let unsubLogs = null;
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

function plannedDueDate(plan, customDate) {
  if (plan === "today") return selectedDate;
  if (plan === "this_week") return sundayFor(selectedDate);
  if (plan === "next_week") return shiftDate(sundayFor(selectedDate), 7);
  return customDate || selectedDate;
}

function dueBadgeHtml(task) {
  if (task.frequency !== "once" || !task.due_date) return "";
  const dueDate = String(task.due_date);
  let label = `Due ${shortDate(dueDate)}`;
  let className = "due-badge";

  if (dueDate < selectedDate) {
    label = `Overdue · ${shortDate(dueDate)}`;
    className += " overdue";
  } else if (dueDate === selectedDate) {
    label = "Due today";
    className += " today";
  } else if (mondayFor(dueDate) === mondayFor(selectedDate)) {
    label = `Due this week · ${shortDate(dueDate)}`;
  }

  return `<span class="${className}">◷ ${esc(label)}</span>`;
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
}

function stopSubscriptions() {
  if (unsubTasks) unsubTasks();
  if (unsubLogs) unsubLogs();
  unsubTasks = null;
  unsubLogs = null;
  tasks = [];
  logs = [];
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
  if (task.frequency === "once") {
    if (!task.due_date) return true;
    return mondayFor(String(task.due_date)) <= date;
  }
  return false;
}

function latestLog(taskId, date) {
  return logs
    .filter((log) => String(log.task_id) === String(taskId) && log.log_date <= date)
    .sort((a, b) => b.log_date.localeCompare(a.log_date))[0] ?? null;
}

function dashboardItems() {
  return tasks.flatMap((task) => {
    if (task.active === false || task.active === 0) return [];
    const latest = latestLog(task.id, selectedDate);
    const scheduledToday = isScheduled(task, selectedDate);
    const loggedToday = latest?.log_date === selectedDate;
    const completedEarlier = latest?.status === "done" && !loggedToday;
    const unfinishedEarlier = Boolean(latest && latest.log_date < selectedDate && latest.status !== "done");
    const oneTimeWindowOpen = task.frequency !== "once" || !task.due_date || mondayFor(String(task.due_date)) <= selectedDate;
    let visible = (Boolean(task.is_urgent) && oneTimeWindowOpen) || scheduledToday || unfinishedEarlier;
    if (task.frequency === "once" && completedEarlier) visible = false;
    if (task.frequency === "once" && latest && latest.status !== "done") visible = true;
    if (!visible) return [];

    const reset = scheduledToday && completedEarlier && task.frequency !== "once";
    const status = loggedToday ? latest.status : reset || !latest ? "todo" : latest.status;
    const note = loggedToday || unfinishedEarlier ? latest?.note ?? "" : "";
    const section = ["daily", "weekly", "twice_monthly", "monthly"].includes(task.frequency)
      ? "core"
      : task.frequency === "anytime" ? "anytime" : "current";
    return [{ ...task, status, note, carried: unfinishedEarlier, section }];
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
        ` : `
          <section class="quest-overview"><div><span class="mini-label">Optional growth time</span><h2>Choose what feels useful today.</h2><p>Side Quests never count against your client-work checklist. One focused lesson or small build is already a win.</p></div><div class="quest-score"><strong>${completedQuests.length}</strong><span>completed today</span></div></section>
          <div class="task-toolbar quest-toolbar"><p>✦ Learn it, then turn it into a report, tool, checklist, or portfolio example.</p><div class="toolbar-actions"><button class="outline-button" data-action="scroll-quests">♕ Quest wins</button><button class="primary-button" data-action="open-add">＋ Add Side Quest</button></div></div>
          ${sectionHtml("Today’s Side Quests", "Pick one—or none. These are possibilities, not obligations.", openQuests)}
          ${sectionHtml("Completed Side Quests", "Today’s learning wins, moved out of your way.", completedQuests)}
          ${questAchievementsHtml()}
        `}
      </div>
      ${addDialogHtml()}
      <div id="toast" class="toast" role="status"></div>
    </main>`;
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
      <div class="task-copy"><div class="task-badges"><span class="client-badge client-${clientClass}">${esc(task.client)}</span><span>${esc(task.category)}</span>${dueBadgeHtml(task)}${task.is_urgent ? `<span class="urgent-badge">⚡ Urgent</span>` : ""}${task.carried ? `<span class="carry-badge">↻ Carried over</span>` : ""}</div><h3>${esc(task.title)}</h3><p>${esc(task.default_note)}</p>${task.blocked_by ? `<p class="blocked-line">Waiting on: ${esc(task.blocked_by)}</p>` : ""}</div>
      <div class="task-actions"><button class="urgent-button ${task.is_urgent ? "active" : ""}" data-action="toggle-urgent" data-task="${esc(task.id)}" ${done ? "disabled" : ""}>⚡ ${task.is_urgent ? "Urgent" : "Mark urgent"}</button><select class="status-select status-${esc(task.status)}" data-action="status" data-task="${esc(task.id)}"><option value="todo" ${task.status === "todo" ? "selected" : ""}>To do</option><option value="in_progress" ${task.status === "in_progress" ? "selected" : ""}>Working on it</option><option value="waiting" ${task.status === "waiting" ? "selected" : ""}>Waiting</option><option value="done" ${done ? "selected" : ""}>Done</option></select></div>
    </div>
    <div class="note-row"><textarea data-note="${esc(task.id)}" placeholder="Add today’s note or where to continue…">${esc(task.note)}</textarea><button class="outline-button small" data-action="save-note" data-task="${esc(task.id)}">Save note</button></div>
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

function addDialogHtml() {
  return `<dialog id="add-dialog"><form method="dialog" id="add-form"><div class="dialog-heading"><div><p class="eyebrow">${activeTab === "quests" ? "Optional growth" : "New work"}</p><h2>${activeTab === "quests" ? "Add a Side Quest" : "Add a task"}</h2></div><button class="icon-button" value="cancel" aria-label="Close">×</button></div><label><span>Task</span><input name="title" required placeholder="What needs to be done?" /></label>${activeTab === "work" ? `<label><span>Client</span><select name="client"><option>Elicra</option><option>OBB</option></select></label>` : ""}<label><span>When should it appear?</span><select name="plan_window" data-plan-window><option value="today">Today</option><option value="this_week">This week</option><option value="next_week">Next week</option><option value="custom">Choose a date</option></select></label><label class="custom-date-field" data-custom-date hidden><span>Due date</span><input name="due_date" type="date" min="${esc(selectedDate)}" value="${esc(selectedDate)}" /></label><label class="urgent-toggle"><input name="is_urgent" type="checkbox" /><span><strong>Mark as urgent</strong><small>Urgent tasks stay at the top of their scheduled list.</small></span></label><label><span>Starting note <small>(optional)</small></span><textarea name="note" placeholder="Add the next step, blocker, or useful context…"></textarea></label><div class="dialog-actions"><button class="primary-button" value="default" data-action="submit-add">Add task</button></div></form></dialog>`;
}

function updateCustomDateField(select) {
  const field = select.closest("form")?.querySelector("[data-custom-date]");
  const input = field?.querySelector('input[name="due_date"]');
  const custom = select.value === "custom";
  if (field) field.hidden = !custom;
  if (input) input.required = custom;
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

async function saveLog(task, status, note = task.note ?? "") {
  const now = new Date().toISOString();
  await setDoc(logPath(task.id, selectedDate), {
    task_id: String(task.id), log_date: selectedDate, status, note,
    completed_at: status === "done" ? now : null, updated_at: now
  }, { merge: true });
  if (status === "done" && task.is_urgent) {
    await setDoc(taskPath(task.id), { is_urgent: false }, { merge: true });
  }
  toast(status === "done" ? "Added to this week’s wins" : "Progress saved");
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
  const button = event.target.closest("button, [data-tab], [data-client]");
  if (!button) return;
  const action = button.dataset.action;

  try {
    if (action === "login-google") await signInWithPopup(auth, new GoogleAuthProvider());
    if (action === "signout") await signOut(auth);
    if (action === "previous-date") { selectedDate = shiftDate(selectedDate, -1); render(); }
    if (action === "next-date") { selectedDate = shiftDate(selectedDate, 1); render(); }
    if (action === "today") { selectedDate = manilaDate(); render(); }
    if (button.dataset.tab) { activeTab = button.dataset.tab; render(); }
    if (button.dataset.client) { clientFilter = button.dataset.client; render(); }
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
      const note = document.querySelector(`[data-note="${CSS.escape(button.dataset.task)}"]`)?.value ?? "";
      if (task) await saveLog(task, task.status, note.trim());
    }
    if (action === "open-add") {
      const dialog = document.querySelector("#add-dialog");
      dialog?.showModal();
      const planSelect = dialog?.querySelector("[data-plan-window]");
      if (planSelect) updateCustomDateField(planSelect);
    }
    if (action === "submit-add") {
      event.preventDefault();
      const form = document.querySelector("#add-form");
      if (!form.reportValidity()) return;
      const values = new FormData(form);
      const id = `custom_${Date.now()}`;
      const title = String(values.get("title") ?? "").trim();
      const note = String(values.get("note") ?? "").trim();
      const plan = String(values.get("plan_window") ?? "today");
      const dueDate = plannedDueDate(plan, String(values.get("due_date") ?? ""));
      const isUrgent = values.get("is_urgent") === "on";
      await setDoc(taskPath(id), {
        id, title, client: activeTab === "quests" ? "Side Quest" : String(values.get("client") ?? "Elicra"),
        category: "Added by Clairy", frequency: "once", schedule_days: null,
        due_date: dueDate, default_note: note, blocked_by: null,
        active: true, is_urgent: isUrgent, sort_order: Date.now(), created_at: new Date().toISOString()
      });
      document.querySelector("#add-dialog")?.close();
      toast(activeTab === "quests" ? "Side Quest added" : "Task added");
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

root.addEventListener("change", async (event) => {
  const planSelect = event.target.closest("[data-plan-window]");
  if (planSelect) {
    updateCustomDateField(planSelect);
    return;
  }
  const select = event.target.closest('select[data-action="status"]');
  if (!select) return;
  const task = visibleItemById(select.dataset.task);
  if (!task) return;
  try { await saveLog(task, select.value); } catch (error) { console.error(error); toast("Progress could not be saved"); }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
