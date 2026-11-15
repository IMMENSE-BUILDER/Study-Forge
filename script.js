const STORAGE_KEY = "studyForgeState-v1";

// v0.6.18: never restore a stale mid-page scroll — every load starts at the very top.
try {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
} catch (e) {}
function scrollPageToTop() {
  try { window.scrollTo(0, 0); } catch (e) {}
  try { document.documentElement.scrollTop = 0; } catch (e) {}
  try { document.body.scrollTop = 0; } catch (e) {}
}
const DEFAULT_DEEPGRAM_KEY = 'b836a67d381f08fec71c60b8a32c84b9d2154017';

function getDeepgramApiKey() {
  return localStorage.getItem('sf_deepgram_api_key') || DEFAULT_DEEPGRAM_KEY || '';
}

async function deepgramTranscribe(audioBlob) {
  const deepgramKey = getDeepgramApiKey();
  if (!deepgramKey) {
    showToast('Voice Key required. Please set your Deepgram key in 🔑 AI Settings.');
    return null;
  }
  try {
    const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramKey}`,
        'Content-Type': audioBlob.type || 'audio/webm'
      },
      body: audioBlob
    });
    const data = await response.json();
    return data.results?.channels[0]?.alternatives[0]?.transcript;
  } catch (err) {
    console.error('Deepgram STT Error:', err);
    return null;
  }
}



// Check authentication moved to index.html <head>

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function createId() {
  return `id-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}

function getTodayLabel() {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return labels[new Date().getDay()] || "Mon";
}

function buildDefaultState() {
  if (typeof buildIPUSeed === "function") {
    const seed = buildIPUSeed();
    return {
      stateVersion: typeof SF_STATE_VERSION === "number" ? SF_STATE_VERSION : 2,
      profile: seed.profile,
      sprint: seed.sprint,
      goals: seed.goals,
      tasks: seed.tasks,
      notes: seed.notes,
      gauges: seed.gauges,
      activeDay: getTodayLabel(),
      xp: 0,
      level: 1,
      streak: 0,
      lastActiveDate: null,
      history: [],
    };
  }
  const calculusGoalId = createId();
  const spanishGoalId = createId();
  return {
    stateVersion: 1,
    profile: null,
    sprint: {
      name: "Week of Feb 6",
      start: "2026-02-06",
      end: "2026-02-12",
    },
    goals: [
      {
        id: calculusGoalId,
        title: "Master Calculus II",
        tag: "8-week sprint",
        progress: 64,
      },
      {
        id: spanishGoalId,
        title: "Spanish B2 Fluency",
        tag: "Daily practice",
        progress: 42,
      },
    ],
    tasks: [
      {
        id: createId(),
        title: "Outline integration techniques",
        duration: "90 mins",
        status: "plan",
        goalId: calculusGoalId,
      },
      {
        id: createId(),
        title: "Create Spanish flashcards",
        duration: "25 mins",
        status: "plan",
        goalId: spanishGoalId,
      },
      {
        id: createId(),
        title: "Practice series tests (Set A)",
        duration: "Due Today",
        status: "progress",
        goalId: calculusGoalId,
      },
      {
        id: createId(),
        title: "Shadow speaking drills",
        duration: "30 mins",
        status: "progress",
        goalId: spanishGoalId,
      },
      {
        id: createId(),
        title: "Summarize lecture 3",
        duration: "Checked",
        status: "done",
        goalId: calculusGoalId,
      },
      {
        id: createId(),
        title: "Grammar quiz review",
        duration: "Checked",
        status: "done",
        goalId: spanishGoalId,
      },
    ],
    notes: [
      {
        id: createId(),
        title: "Session 12",
        date: "Feb 6",
        text: "Integration by parts finally clicked. Need to revisit convergence tests before Friday.",
        focus: 8,
        expanded: false,
      },
      {
        id: createId(),
        title: "Session 13",
        date: "Feb 7",
        text: "Spanish listening felt smoother. Create a deck for travel vocabulary.",
        focus: 7,
        expanded: false,
      },
    ],
    gauges: {
      consistency: 72,
      energy: 58,
      retention: 84,
    },
    activeDay: getTodayLabel(),
    xp: 0,
    level: 1,
    streak: 0,
    lastActiveDate: null,
    history: [],
  };
}

function getFreshState() {
  return JSON.parse(JSON.stringify(buildDefaultState()));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// v32: escape user/AI text before it ever reaches innerHTML.
function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeGoal(goal) {
  if (!goal || typeof goal !== "object") return null;
  return {
    id: goal.id || createId(),
    title: String(goal.title || "Untitled goal"),
    tag: String(goal.tag || "Sprint"),
    progress: clamp(Number(goal.progress) || 0, 0, 100),
  };
}

function normalizeTask(task) {
  if (!task || typeof task !== "object") return null;
  const status = ["plan", "progress", "done"].includes(task.status)
    ? task.status
    : "plan";
  return {
    id: task.id || createId(),
    title: String(task.title || "Untitled task"),
    duration: String(task.duration || "TBD"),
    status,
    goalId: task.goalId ? String(task.goalId) : "",
  };
}

function normalizeNote(note) {
  if (!note || typeof note !== "object") return null;
  return {
    id: note.id || createId(),
    title: String(note.title || "Session"),
    date: String(note.date || formatDateShort(new Date())),
    text: String(note.text || ""),
    focus: clamp(Number(note.focus) || 7, 1, 10),
    expanded: Boolean(note.expanded),
  };
}

function normalizeGauges(raw, fallback) {
  const base = fallback || { consistency: 0, energy: 0, retention: 0 };
  if (!raw || typeof raw !== "object") {
    return { ...base };
  }
  return {
    consistency: clamp(Number(raw.consistency) || 0, 0, 100),
    energy: clamp(Number(raw.energy) || 0, 0, 100),
    retention: clamp(Number(raw.retention) || 0, 0, 100),
  };
}

function loadState() {
  const base = getFreshState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return base;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return base;
    }
    const merged = {
      stateVersion: typeof parsed.stateVersion === "number" ? parsed.stateVersion : 1,
      profile: parsed.profile && typeof parsed.profile === "object" ? parsed.profile : null,
      sprint: { ...base.sprint, ...(parsed.sprint || {}) },
      goals: Array.isArray(parsed.goals)
        ? parsed.goals.map(normalizeGoal).filter(Boolean)
        : base.goals,
      tasks: Array.isArray(parsed.tasks)
        ? parsed.tasks.map(normalizeTask).filter(Boolean)
        : base.tasks,
      notes: Array.isArray(parsed.notes)
        ? parsed.notes.map(normalizeNote).filter(Boolean)
        : base.notes,
      gauges: normalizeGauges(parsed.gauges, base.gauges),
      activeDay: DAY_LABELS.includes(parsed.activeDay)
        ? parsed.activeDay
        : base.activeDay,
      xp: typeof parsed.xp === "number" ? parsed.xp : base.xp,
      level: typeof parsed.level === "number" ? parsed.level : base.level,
      streak: typeof parsed.streak === "number" ? parsed.streak : base.streak,
      lastActiveDate: parsed.lastActiveDate || base.lastActiveDate,
      history: Array.isArray(parsed.history) ? parsed.history : base.history,
    };
    return migrateStateVersion(merged);
  } catch (error) {
    return base;
  }
}

/* Merge the IPU pack into older saved states without wiping user data. */
function migrateStateVersion(merged) {
  const target = typeof SF_STATE_VERSION === "number" ? SF_STATE_VERSION : 2;
  if (typeof defaultProfile === "function") {
    merged.profile = { ...defaultProfile(), ...(merged.profile || {}) };
  }
  // v32: "SMT-1" renamed to "SMT". Rename stored titles/ids in place (idempotent).
  const smtGoal = merged.goals.find((g) => g.id === "ipu-goal-smt-1" || /^SMT-1\s*·/.test(g.title || ""));
  if (smtGoal) {
    merged.tasks.forEach((t) => { if (t.goalId === smtGoal.id) t.goalId = "ipu-goal-smt"; });
    smtGoal.id = "ipu-goal-smt";
    smtGoal.title = String(smtGoal.title).replace(/^SMT-1\s*·/, "SMT ·");
  }
  merged.tasks.forEach((t) => { t.title = String(t.title || "").replace(/^SMT-1(\s)/, "SMT$1"); });
  // v65: align seeded goal titles with official 2026 course codes/names (matching
  // SF_FACULTY). Rename in place by stable ipu-goal-* id, exact-title match only —
  // idempotent; user-renamed goals, progress, XP and task links stay untouched.
  const GOAL_TITLE_FIXES_2026 = {
    "ipu-goal-smt": ["SMT · System Modeling Techniques–I (ICT-105)", "SMT · System Modeling Techniques–I (ICT-107)"],
    "ipu-goal-em": ["EM · Engineering Mechanics (ICT-107/120)", "EM · Engineering Mechanics (ICT-119)"],
    "ipu-goal-bee": ["BEE · Basics of Electrical Engineering (ICT-103/118)", "BEE · Basics of Electrical Engineering (ICT-103T/ICT-106T)"],
    "ipu-goal-phl": ["PHL · Semiconductor Engineering (ICT-110/117)", "PHL · Engineering Physics–I (ICT-111T)"],
    "ipu-goal-csl": ["CSL · Communication Skills (ICT-109)", "CSL · Communication Skills (ICT-113)"],
    "ipu-goal-evsl": ["EVSL · Environmental Studies (ICT-112)", "EVSL · Environmental Studies (ICT-117T)"],
  };
  merged.goals.forEach((g) => {
    const fix = GOAL_TITLE_FIXES_2026[g.id];
    if (fix && g.title === fix[0]) g.title = fix[1];
  });
  const smtNote = merged.notes.find((n) => n.id === "ipu-note-timetable");
  if (smtNote && typeof SF_TIMETABLE_NOTE === "string") smtNote.text = SF_TIMETABLE_NOTE;
  if (merged.stateVersion === 2) {
    // v2→v3 corrections: user is Sec E (Room 2310), PD decoded, EGL decoded.
    merged.profile.section = "E";
    merged.profile.room = "2310";
    const pdGoal = merged.goals.find((g) => /Human Values/i.test(g.title));
    if (pdGoal) {
      pdGoal.title = "PD · Personality Development";
      pdGoal.tag = "Sem 1 · PD hour";
    }
    const pdTask = merged.tasks.find((t) => t.title === "PD Unit I: harmony-in-self summary");
    if (pdTask) pdTask.title = "PD: self-SWOT + 1-min intro draft";
    const ttNote = merged.notes.find((n) => n.id === "ipu-note-timetable");
    if (ttNote && typeof SF_TIMETABLE_NOTE === "string") {
      ttNote.title = "🗓 My Timetable — Sec E · Room 2310";
      ttNote.text = SF_TIMETABLE_NOTE;
    }
    if (merged.sprint && /Sec F/.test(merged.sprint.name || "")) {
      merged.sprint.name = merged.sprint.name.replace("Sec F", "Sec E");
    }
  }
  if (merged.stateVersion < target) {
    // Timetable re-decoded from the official Sec-E photo (v4: Tue/Wed/Thu/Fri;
    // v5: Mon lab double + BEE shift). Slot data lives in syllabus.js (rendered
    // fresh); only the saved note copy goes stale, so refresh it for any older state.
    const ttNote = merged.notes.find((n) => n.id === "ipu-note-timetable");
    if (ttNote && typeof SF_TIMETABLE_NOTE === "string") {
      ttNote.text = SF_TIMETABLE_NOTE;
    }
  }
  if (merged.stateVersion === target || typeof buildIPUSeed !== "function") {
    merged.stateVersion = target;
    return merged;
  }
  try {
    const seed = buildIPUSeed();
    const goalTitles = new Set(merged.goals.map((g) => g.title));
    const idByTitle = {};
    merged.goals.forEach((g) => { idByTitle[g.title] = g.id; });
    seed.goals.forEach((g) => {
      if (!goalTitles.has(g.title)) {
        merged.goals.push({ ...g });
      }
      idByTitle[g.title] = idByTitle[g.title] || g.id;
    });
    const taskKeys = new Set(merged.tasks.map((t) => `${t.title}||${t.goalId}`));
    seed.tasks.forEach((t) => {
      const goalId = idByTitle[seed.goals.find((g) => g.id === t.goalId)?.title] || "";
      if (!taskKeys.has(`${t.title}||${goalId}`)) {
        merged.tasks.push({ ...t, id: t.id + "-" + Date.now(), goalId });
      }
    });
    const noteTitles = new Set(merged.notes.map((n) => n.title));
    const noteIds = new Set(merged.notes.map((n) => n.id));
    seed.notes.forEach((n) => {
      if (!noteTitles.has(n.title) && !noteIds.has(n.id)) {
        merged.notes.push({ ...n });
      }
    });
  } catch (error) {
    console.warn("IPU migration skipped:", error);
  }
  merged.stateVersion = target;
  return merged;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    showToast("Unable to save locally.");
  }
}

function formatDateShort(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function toISODate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function buildSprintLabel() {
  const name = state.sprint?.name ? state.sprint.name.trim() : "";
  const start = formatDateShort(state.sprint?.start);
  const end = formatDateShort(state.sprint?.end);
  if (name && (start || end)) {
    return `Sprint: ${name} (${start}${end ? " - " + end : ""})`;
  }
  if (name) {
    return `Sprint: ${name}`;
  }
  if (start || end) {
    return `Sprint: ${start}${end ? " - " + end : ""}`;
  }
  return "Sprint: Unnamed";
}

function buildSummary() {
  const lines = [];
  lines.push("Study Forged Summary");
  lines.push(buildSprintLabel());
  lines.push("");
  lines.push("Goals:");
  if (!state.goals.length) {
    lines.push("- None yet");
  } else {
    state.goals.forEach((goal) => {
      const progress = getGoalProgress(goal);
      lines.push(`- ${goal.title} (${progress}%)`);
    });
  }
  lines.push("");
  lines.push("Tasks:");
  const statusMap = {
    plan: "Plan",
    progress: "In Progress",
    done: "Done",
  };
  Object.entries(statusMap).forEach(([key, label]) => {
    const tasks = state.tasks.filter((task) => task.status === key);
    lines.push(`${label} (${tasks.length})`);
    tasks.slice(0, 4).forEach((task) => {
      lines.push(`  - ${task.title} [${task.duration}]`);
    });
    if (tasks.length > 4) {
      lines.push(`  - +${tasks.length - 4} more`);
    }
  });
  lines.push("");
  lines.push(`Notes: ${state.notes.length}`);
  if (state.notes.length) {
    const latest = state.notes[0];
    lines.push(`Latest: ${latest.title} (${latest.date})`);
  }
  return lines.join("\n");
}

function showToast(message) {
  if (!elements.toast) return;
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2400);
}

function openDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

let confirmResolver = null;

function resolveConfirm(value) {
  if (!confirmResolver) return;
  confirmResolver(value);
  confirmResolver = null;
  closeDialog(elements.confirmDialog);
}

function requestConfirm(message) {
  return new Promise((resolve) => {
    confirmResolver = resolve;
    elements.confirmMessage.textContent = message;
    openDialog(elements.confirmDialog);
  });
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let stt = null;
let sttListening = false;
let sttBaseText = "";
let sttFinalText = "";

function setSttUI(isActive) {
  if (!elements.sttBtn || !elements.sttStatus) return;
  sttListening = isActive;
  elements.sttBtn.textContent = isActive ? "Stop Dictation" : "Start Dictation";
  elements.sttBtn.classList.toggle("listening", isActive);
  elements.sttStatus.textContent = isActive ? "Listening..." : "Mic idle";
}

function initSTT() {
  if (!elements.sttBtn || !elements.sttStatus) return;

  let mediaRecorder = null;
  let chunks = [];

  elements.sttBtn.addEventListener("click", async () => {
    if (sttListening) {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      chunks = [];

      mediaRecorder.ondataavailable = e => chunks.push(e.data);

      mediaRecorder.onstop = async () => {
        setSttUI(false);
        elements.sttStatus.textContent = "Transcribing...";
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const text = await deepgramTranscribe(blob);
        if (text) {
          const current = elements.noteText.value;
          elements.noteText.value = current ? current + ' ' + text : text;
          elements.sttStatus.textContent = "Mic idle";
        } else {
          elements.sttStatus.textContent = "Error / No speech";
        }
        sttListening = false;
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setSttUI(true);
      sttListening = true;
    } catch (err) {
      showToast("Mic access denied or error.");
      console.error(err);
    }
  });
}

function createEmptyState(message) {
  const empty = document.createElement("p");
  empty.className = "empty-state";
  empty.textContent = message;
  return empty;
}

function getGoalById(goalId) {
  return state.goals.find((goal) => goal.id === goalId);
}

function getGoalProgress(goal) {
  const linkedTasks = state.tasks.filter((task) => task.goalId === goal.id);
  if (!linkedTasks.length) {
    return clamp(Number(goal.progress) || 0, 0, 100);
  }
  const doneCount = linkedTasks.filter((task) => task.status === "done").length;
  return Math.round((doneCount / linkedTasks.length) * 100);
}

function getGoalTaskStats(goalId) {
  const tasks = state.tasks.filter((task) => task.goalId === goalId);
  const done = tasks.filter((task) => task.status === "done").length;
  return { total: tasks.length, done };
}

function shareText(title, text) {
  // Prioritize clipboard copy over native share
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text)
      .then(() => showToast("Summary copied to clipboard."))
      .catch(() => window.prompt("Copy summary:", text));
    return;
  }

  // Fallback for non-secure contexts (like some file:// opens)
  try {
    // Try a legacy approach for wider compatibility if needed, 
    // or just fallback to prompt which is reliable.
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);

    if (successful) {
      showToast("Summary copied to clipboard.");
      return;
    }
  } catch (err) {
    // Fallthrough to prompt
  }

  window.prompt("Copy summary:", text);
}

function buildMenu(type, id) {
  const menu = document.createElement("div");
  menu.className = "menu";
  menu.dataset.menuType = type;
  if (id) {
    menu.dataset.id = id;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "menu-button";
  button.setAttribute("aria-label", `${type} menu`);
  button.setAttribute("aria-haspopup", "true");
  button.setAttribute("aria-expanded", "false");
  button.textContent = "⋯";

  const list = document.createElement("div");
  list.className = "menu-list";
  list.setAttribute("role", "menu");

  const actions = [
    { label: "Share", action: `share-${type}` },
    { label: "Add", action: `add-${type}` },
    { label: "Delete", action: `delete-${type}`, danger: true },
  ];

  actions.forEach((item) => {
    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className = "menu-item";
    if (item.danger) {
      actionButton.classList.add("danger");
    }
    actionButton.dataset.action = item.action;
    actionButton.textContent = item.label;
    list.appendChild(actionButton);
  });

  menu.append(button, list);
  return menu;
}

function closeMenus(except) {
  document.querySelectorAll(".menu.open").forEach((menu) => {
    if (menu === except) return;
    menu.classList.remove("open");
    const button = menu.querySelector(".menu-button");
    if (button) {
      button.setAttribute("aria-expanded", "false");
    }
  });
}

function setDialValue(dial, value) {
  const clamped = clamp(Number(value) || 0, 0, 100);
  const degrees = clamped * 3.6;
  dial.style.setProperty("--fill", `${degrees}deg`);
  dial.dataset.value = clamped;
}

function renderSprint() {
  if (elements.sprintLabel) elements.sprintLabel.textContent = buildSprintLabel();
}

function renderGoals() {
  elements.goalsList.innerHTML = "";
  if (!state.goals.length) {
    elements.goalsList.appendChild(createEmptyState("No goals yet."));
    return;
  }

  state.goals.forEach((goal) => {
    const card = document.createElement("div");
    card.className = "goal-card";
    card.appendChild(buildMenu("goal", goal.id));

    const meta = document.createElement("div");
    meta.className = "goal-meta";

    const title = document.createElement("h3");
    title.textContent = goal.title;

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = goal.tag;

    meta.append(title, tag);

    const progress = document.createElement("div");
    progress.className = "progress";

    const bar = document.createElement("div");
    bar.className = "bar";

    const barFill = document.createElement("span");
    const progressValue = getGoalProgress(goal);
    barFill.style.width = `${progressValue}%`;
    bar.appendChild(barFill);

    const percent = document.createElement("small");
    percent.textContent = `${progressValue}% complete`;

    progress.append(bar, percent);
    const stats = getGoalTaskStats(goal.id);
    if (stats.total) {
      const details = document.createElement("small");
      details.textContent = `Tasks: ${stats.done}/${stats.total} linked`;
      progress.appendChild(details);
    }

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "ghost mini-btn goal-edit";
    editBtn.dataset.goalId = goal.id;
    editBtn.textContent = "Edit";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "ghost mini-btn goal-delete";
    deleteBtn.dataset.goalId = goal.id;
    deleteBtn.textContent = "Delete";

    actions.append(editBtn, deleteBtn);
    card.append(meta, progress, actions);
    elements.goalsList.appendChild(card);
  });
}

function renderTasks() {
  const planTasks = state.tasks.filter((task) => task.status === "plan");
  const progressTasks = state.tasks.filter((task) => task.status === "progress");
  const doneTasks = state.tasks.filter((task) => task.status === "done");

  renderTaskList(elements.planList, planTasks, "plan");
  renderTaskList(elements.progressList, progressTasks, "progress");
  renderTaskList(elements.doneList, doneTasks, "done");
}

function renderTaskList(list, tasks, status) {
  list.innerHTML = "";
  if (!tasks.length) {
    list.appendChild(createEmptyState("No tasks here."));
    return;
  }

  tasks.forEach((task) => {
    const card = document.createElement("div");
    card.className = "task-card";
    if (status === "progress") {
      card.classList.add("highlight");
    }
    if (status === "done") {
      card.classList.add("done");
    }
    card.dataset.id = task.id;
    card.dataset.status = task.status;
    card.title = "Click to move to the next column";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.draggable = true;
    card.appendChild(buildMenu("task", task.id));

    const title = document.createElement("p");
    title.textContent = task.title;

    let goalTag = null;
    if (task.goalId) {
      const goal = getGoalById(task.goalId);
      if (goal) {
        goalTag = document.createElement("span");
        goalTag.className = "task-goal";
        goalTag.textContent = goal.title;
      }
    }

    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = task.duration;

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "ghost mini-btn task-edit";
    editBtn.dataset.taskId = task.id;
    editBtn.textContent = "Edit";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "ghost mini-btn task-delete";
    deleteBtn.dataset.taskId = task.id;
    deleteBtn.textContent = "Delete";

    actions.append(editBtn, deleteBtn);
    if (goalTag) {
      card.append(title, goalTag, pill, actions);
    } else {
      card.append(title, pill, actions);
    }
    list.appendChild(card);
  });
}

function renderNotes() {
  elements.notesList.innerHTML = "";
  if (!state.notes.length) {
    elements.notesList.appendChild(createEmptyState("No notes yet."));
    return;
  }

  state.notes.forEach((note) => {
    const card = document.createElement("div");
    card.className = "note";
    if (note.expanded) {
      card.classList.add("expanded");
    }

    const header = document.createElement("div");
    header.className = "note-header";

    const title = document.createElement("h3");
    title.textContent = note.title;

    const stamp = document.createElement("span");
    stamp.className = "stamp";
    stamp.textContent = note.date;

    header.append(title, stamp);

    const text = document.createElement("p");
    text.className = "note-text";
    text.textContent = note.text;

    const footer = document.createElement("div");
    footer.className = "note-footer";

    const mood = document.createElement("span");
    mood.className = "mood";
    mood.textContent = `Focus: ${note.focus}/10`;

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const expand = document.createElement("button");
    expand.className = "ghost mini-btn expand-btn";
    expand.textContent = note.expanded ? "Collapse" : "Expand";
    expand.dataset.id = note.id;

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "ghost mini-btn note-edit";
    edit.dataset.noteId = note.id;
    edit.textContent = "Edit";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ghost mini-btn note-delete";
    remove.dataset.noteId = note.id;
    remove.textContent = "Delete";

    actions.append(expand, edit, remove);
    footer.append(mood, actions);
    card.append(header, text, footer);
    elements.notesList.appendChild(card);
  });
}

function renderGauges() {
  const gauges = document.querySelectorAll(".gauge");
  gauges.forEach((gauge) => {
    const metric = gauge.dataset.metric;
    const dial = gauge.querySelector(".dial");
    if (!dial) return;
    const value = state.gauges[metric] ?? 0;
    setDialValue(dial, value);
  });
}

function renderTimeline() {
  if (!elements.timeline) return;
  elements.timeline.innerHTML = "";
  DAY_LABELS.forEach((day) => {
    const tick = document.createElement("div");
    tick.className = "tick";
    tick.textContent = day;
    tick.dataset.day = day;
    tick.tabIndex = 0;
    tick.setAttribute("role", "button");
    if (state.activeDay === day) {
      tick.classList.add("active");
    }
    elements.timeline.appendChild(tick);
  });
}

// ─── Today layer: greeting + date + today's subjects + focus tasks ───
function baseSubject(alias) {
  if (alias === "PHP") return "PHL";
  if (alias === "PPS LAB") return "PPS";
  if (alias === "BEE LAB") return "BEE";
  return alias;
}

function getTodayAgenda(s, now) {
  now = now || new Date();
  const dayKeys = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const day = dayKeys[now.getDay()];
  const firstName = s.profile && s.profile.name ? String(s.profile.name).split(" ")[0] : "there";
  const h = now.getHours();
  const agenda = {
    greeting: `Good ${h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"}, ${firstName}`,
    dateLabel: new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(now),
    day,
    isSunday: day === "Sun",
    isWeekend: day === "Sun" || day === "Sat",
    subjects: [],
    suggestions: [],
    sprintStale: false,
  };
  const dow = (now.getDay() + 6) % 7;
  const mon = new Date(now);
  mon.setDate(now.getDate() - dow);
  const monISO = new Date(mon.getTime() - mon.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  if (!s.sprint || !s.sprint.start || s.sprint.start < monISO) agenda.sprintStale = true;
  if (!SF_TIMETABLE[day]) return agenda;
  const seen = {};
  SF_TIMETABLE[day].forEach((cell) => {
    const r = typeof ttResolve === "function" ? ttResolve(cell) : null;
    if (!r || r === "FREE" || r === "LUNCH" || seen[r]) return;
    seen[r] = true;
    agenda.subjects.push(baseSubject(r));
  });
  const goalAlias = {};
  (s.goals || []).forEach((g) => {
    goalAlias[g.id] = String(g.title || "").split("·")[0].trim();
  });
  agenda.suggestions = (s.tasks || [])
    .filter((t) => t.status === "plan" && agenda.subjects.includes(goalAlias[t.goalId]))
    .slice(0, 3)
    .map((t) => ({ id: t.id, title: t.title, duration: t.duration, goal: goalAlias[t.goalId] }));
  return agenda;
}

function renderToday() {
  const card = document.getElementById("todayCard");
  if (!card) return;
  const a = getTodayAgenda(state);
  card.innerHTML = "";

  const greet = document.createElement("h3");
  greet.className = "today-greet";
  greet.textContent = `${a.greeting} 👋`;
  card.appendChild(greet);

  const date = document.createElement("p");
  date.className = "today-date";
  const sem = state.profile ? ` · Sem ${state.profile.sem} · Sec ${state.profile.section}` : "";
  date.textContent = `${a.dateLabel}${sem}`;
  card.appendChild(date);

  if (a.isWeekend) {
    const line = document.createElement("p");
    line.className = "today-line";
    line.textContent = "No college today. Review the week in Snapshot 📊";
    card.appendChild(line);
  } else {
    const line = document.createElement("p");
    line.className = "today-line";
    line.textContent = a.subjects.length
      ? `Today's classes: ${a.subjects.join(" · ")}`
      : "No classes on the timetable today.";
    card.appendChild(line);

    if (a.suggestions.length) {
      const label = document.createElement("p");
      label.className = "today-label";
      label.textContent = "Today's focus";
      card.appendChild(label);
      a.suggestions.forEach((t) => {
        const row = document.createElement("div");
        row.className = "today-task";
        const title = document.createElement("span");
        title.textContent = t.title;
        const pill = document.createElement("span");
        pill.className = "pill";
        row.appendChild(title);
        row.appendChild(pill);
        card.appendChild(row);
      });
      const open = document.createElement("button");
      open.type = "button";
      open.className = "ghost mini-btn";
      open.textContent = "Open Tasks →";
      open.addEventListener("click", () => {
        const tab = document.querySelector('.nav-tab[data-target="tasks"]');
        if (tab) tab.click();
      });
      card.appendChild(open);
    } else if (a.subjects.length) {
      const line2 = document.createElement("p");
      line2.className = "today-line";
      line2.textContent = "Nothing pending for today's subjects 🎉";
      card.appendChild(line2);
    }
  }

  if (a.sprintStale) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "neo full today-sprint-btn";
    btn.textContent = "📅 Start this week's sprint";
    btn.addEventListener("click", () => openSprintDialog());
    card.appendChild(btn);
  }
}

// ─── Sec-E Timetable view (Room 2310) ───
function ttTodayKey() {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date().getDay()];
}

function ttToMin(hm) {
  const parts = String(hm).split(":");
  let h = Number(parts[0]);
  const m = Number(parts[1]) || 0;
  if (h < 8) h += 12; // college hours run 8:15 AM – 3:10 PM
  return h * 60 + m;
}

function ttNowIndex(day) {
  if (typeof SF_TIMETABLE === "undefined" || !SF_TIMETABLE[day]) return -1;
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const cells = SF_TIMETABLE[day];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === "FREE" || cells[i] === "LUNCH") continue;
    const range = SF_TT_SLOTS[i].split("-");
    if (nowMin >= ttToMin(range[0]) && nowMin < ttToMin(range[1])) return i;
  }
  return -1;
}

// Group consecutive identical periods (double labs like Wed E1(EVS)/E2(BEE)
// or Fri EGL) into one merged box. FREE/LUNCH never merge. Data stays
// 8 slots; merging is render-only so agenda + live states keep working.
function ttGroupDay(day) {
  const cells = SF_TIMETABLE[day];
  const groups = [];
  cells.forEach((cell, i) => {
    const prev = groups[groups.length - 1];
    if (prev && prev.cell === cell && cell !== "FREE" && cell !== "LUNCH") {
      prev.indices.push(i);
    } else {
      groups.push({ cell, indices: [i] });
    }
  });
  return groups;
}

function ttGroupRange(g) {
  const first = SF_TT_SLOTS[g.indices[0]].split("-");
  const last = SF_TT_SLOTS[g.indices[g.indices.length - 1]].split("-");
  return { label: `${first[0]}-${last[1]}`, s: ttToMin(first[0]), e: ttToMin(last[1]) };
}

function renderTimetable() {
  const grid = document.getElementById("ttGrid");
  const nowLine = document.getElementById("ttNowLine");
  if (!grid || typeof SF_TIMETABLE === "undefined") return;
  const today = ttTodayKey();
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const shortCell = (c) => (typeof ttShort === "function" ? ttShort(c) : c);

  let line;
  if (today === "Sun" || !SF_TIMETABLE[today]) {
    line = "No college today. Plan the week ahead 🎯";
  } else {
    const groups = ttGroupDay(today);
    let cur = -1;
    let next = -1;
    groups.forEach((g, gi) => {
      if (g.cell === "FREE" || g.cell === "LUNCH") return;
      const r = ttGroupRange(g);
      if (nowMin >= r.s && nowMin < r.e) cur = gi;
      if (next < 0 && r.s > nowMin) next = gi;
    });
    const fmt = (gi) => `${shortCell(groups[gi].cell)} (${ttGroupRange(groups[gi]).label})`;
    if (cur >= 0) {
      line = `🔴 Now: ${fmt(cur)}${next >= 0 ? ` · Next: ${fmt(next)}` : " · last class of the day"}`;
    } else if (next >= 0) {
      line = `Next up: ${fmt(next)}`;
    } else {
      line = "College over for today 🎉 — log today's sessions in Notes.";
    }
  }
  if (nowLine) nowLine.textContent = line;

  grid.innerHTML = "";
  ["Mon", "Tue", "Wed", "Thu", "Fri"].forEach((day) => {    const col = document.createElement("div");
    col.className = "tt-day" + (day === today ? " tt-today" : "");
    const head = document.createElement("div");
    head.className = "tt-day-name";
    head.textContent = day === today ? `${day} • today` : day;
    col.appendChild(head);
    ttGroupDay(day).forEach((g) => {
      const cell = g.cell;
      const range = ttGroupRange(g);
      const b = document.createElement("button");
      b.type = "button";
      const info = typeof ttInfo === "function" ? ttInfo(cell) : { alias: cell, meta: null };
      // Live states, today only: done (solid orange) or now (liquid fill %).
      // Merged doubles (labs) fill across the combined span.
      let live = "";
      if (day === today && cell !== "FREE" && cell !== "LUNCH") {
        const s = range.s;
        const e = range.e;
        if (nowMin >= e) {
          live = " tt-done";
        } else if (nowMin >= s) {
          live = " tt-now";
          b.style.setProperty("--fill", `${Math.round(((nowMin - s) / (e - s)) * 100)}%`);
        }
      }
      b.className = "tt-cell"
        + (cell === "FREE" ? " tt-free" : "")
        + (cell === "LUNCH" ? " tt-lunch" : "")
        + (g.indices.length > 1 ? " tt-double" : "")
        + live;
      const top = document.createElement("div");
      top.className = "tt-topline";
      const time = document.createElement("span");
      time.className = "tt-time";
      time.textContent = range.label;
      const sub = document.createElement("span");
      sub.className = "tt-sub";
      sub.textContent = shortCell(cell);
      top.append(time, sub);
      b.appendChild(top);
      if (info.meta) {
        const fac = document.createElement("span");
        fac.className = "tt-fac";
        fac.textContent = info.meta.faculty;
        b.appendChild(fac);
      }
      if (cell !== "FREE" && cell !== "LUNCH") {
        b.addEventListener("click", () => {
          const room = (state.profile && state.profile.room) || "2310";
          const isLab = /lab|\(l\/p\)|\(/i.test(cell);
          let detail = info.meta
            ? isLab
              ? `${cell} · ${info.meta.name} · ${info.meta.faculty}`
              : `${cell} · ${info.meta.name} · ${info.meta.faculty} · Room ${room}`
            : isLab
              ? cell
              : `${cell} · Room ${room}`;
          const labSplit = (typeof SF_LAB_INFO !== "undefined" && SF_LAB_INFO[cell] && SF_LAB_INFO[cell].batches) || "";
          if (labSplit) detail += ` · ${labSplit}`;
          showToast(detail);
        });
      }
      col.appendChild(b);
    });
    grid.appendChild(col);
  });
}

const XP_THRESHOLDS = [0, 100, 250, 500, 1000, 2000];
const LEVEL_NAMES = ["Novice", "Apprentice", "Scholar", "Expert", "Master", "Legend"];

function getLevelForXP(xp) {
  let level = 1;
  for (let i = 1; i < XP_THRESHOLDS.length; i++) {
    if (xp >= XP_THRESHOLDS[i]) {
      level = i + 1;
    }
  }
  return level;
}

function getXPProgress() {
  const level = state.level;
  const currentThreshold = XP_THRESHOLDS[level - 1] || 0;
  const nextThreshold = XP_THRESHOLDS[level] || XP_THRESHOLDS[XP_THRESHOLDS.length - 1];
  const xpInLevel = state.xp - currentThreshold;
  const xpNeeded = nextThreshold - currentThreshold;
  return Math.min((xpInLevel / xpNeeded) * 100, 100);
}

function renderXPBar() {
  if (!elements.xpBarFill || !elements.xpLabel) return;
  const progress = getXPProgress();
  elements.xpBarFill.style.width = `${progress}%`;
  const levelName = LEVEL_NAMES[state.level - 1] || "Novice";
  elements.xpLabel.textContent = `Lvl ${state.level} ${levelName} · ${state.xp} XP`;
}

function renderStreak() {
  if (!elements.streakBadge) return;
  elements.streakBadge.textContent = `🔥 ${state.streak}`;
}

function getTodayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function updateStreak() {
  const today = getTodayISO();
  if (state.lastActiveDate === today) {
    return; // Already active today
  }
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayISO = yesterday.toISOString().slice(0, 10);

  if (state.lastActiveDate === yesterdayISO) {
    state.streak += 1;
  } else if (state.lastActiveDate !== today) {
    state.streak = 1; // Reset streak
  }
  state.lastActiveDate = today;
}

function awardXP(amount) {
  const oldLevel = state.level;
  state.xp += amount;
  state.level = getLevelForXP(state.xp);
  updateStreak();
  saveState();
  renderXPBar();
  renderStreak();
  if (state.level > oldLevel) {
    const levelName = LEVEL_NAMES[state.level - 1] || "Champion";
    showToast(`🎉 Level Up! You are now a ${levelName}!`);
  }
}

function triggerConfetti() {
  if (typeof confetti === "function") {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  }
}

function renderAll() {
  renderToday();
  renderTimetable();
  renderSprint();
  renderGoals();
  renderTasks();
  renderNotes();
  renderGauges();
  renderTimeline();
  renderGoalOptions();
  renderXPBar();
  renderStreak();
}

function spawnClickEffect(x, y) {
  if (!elements.clickFx) return;
  const pop = document.createElement("div");
  pop.className = "click-pop";
  pop.style.left = `${x}px`;
  pop.style.top = `${y}px`;

  const angles = [0, 60, 120, 180, 240, 300];
  angles.forEach((angle, index) => {
    const spark = document.createElement("span");
    spark.className = "spark";
    spark.style.setProperty("--angle", `${angle}deg`);
    spark.style.animationDelay = `${index * 20}ms`;
    pop.appendChild(spark);
  });

  elements.clickFx.appendChild(pop);
  setTimeout(() => {
    pop.remove();
  }, 520);
}

function updateGoalProgressLabel() {
  const value = clamp(Number(elements.goalProgress.value) || 0, 0, 100);
  elements.goalProgressValue.textContent = `${value}%`;
}

function getNextSessionNumber() {
  const matches = state.notes
    .map((note) => {
      const match = String(note.title).match(/Session\s+(\d+)/i);
      return match ? Number(match[1]) : null;
    })
    .filter((value) => Number.isFinite(value));

  if (!matches.length) {
    return state.notes.length + 1;
  }
  return Math.max(...matches) + 1;
}

function cycleTaskStatus(taskId) {
  const order = ["plan", "progress", "done"];
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  const oldStatus = task.status;
  const index = order.indexOf(task.status);
  task.status = order[(index + 1) % order.length];

  // Award XP based on transition
  if (oldStatus === "plan" && task.status === "progress") {
    awardXP(25);
  } else if (oldStatus === "progress" && task.status === "done") {
    awardXP(50);
    triggerConfetti();
  } else if (oldStatus === "done" && task.status === "plan") {
    // Cycling back, no XP
  }

  saveState();
  renderTasks();
  renderGoals();
  showToast(`Task moved to ${task.status.replace("progress", "in progress")}.`);
}

function shareGoal(goalId) {  const goal = state.goals.find((item) => item.id === goalId);
  if (!goal) {
    showToast("Goal not found.");
    return;
  }
  const text = `Goal: ${goal.title}\nTag: ${goal.tag}\nProgress: ${goal.progress}%`;
  shareText("Study Forged Goal", text);
}

function shareTask(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    showToast("Task not found.");
    return;
  }
  const statusLabel = task.status === "progress" ? "In Progress" : task.status;
  const text = `Task: ${task.title}\nStatus: ${statusLabel}\nTiming: ${task.duration}`;
  shareText("Study Forged Task", text);
}

function startNoteEdit(noteId) {
  const note = state.notes.find((item) => item.id === noteId);
  if (!note) {
    showToast("Note not found.");
    return;
  }
  editingNoteId = noteId;
  elements.noteTitle.value = note.title;
  elements.noteText.value = note.text;
  elements.noteFocus.value = String(note.focus);
  elements.cancelNoteEditBtn.classList.add("show");
  elements.saveNoteBtn.textContent = "Update Note";
  elements.noteText.focus();
}

async function deleteNote(noteId) {
  const note = state.notes.find((item) => item.id === noteId);
  if (!note) {
    showToast("Note not found.");
    return;
  }
  const confirmed = await requestConfirm(`Delete note "${note.title}"?`);
  if (!confirmed) {
    return;
  }
  state.notes = state.notes.filter((item) => item.id !== noteId);
  if (editingNoteId === noteId) {
    editingNoteId = null;
    elements.noteTitle.value = "";
    elements.noteText.value = "";
    elements.noteFocus.value = "7";
    elements.cancelNoteEditBtn.classList.remove("show");
    elements.saveNoteBtn.textContent = "Save Note";
  }
  saveState();
  renderNotes();
  showToast("Note deleted.");
}

async function deleteGoal(goalId) {
  const goal = state.goals.find((item) => item.id === goalId);
  if (!goal) {
    showToast("Goal not found.");
    return;
  }
  const confirmed = await requestConfirm(`Delete goal "${goal.title}"?`);
  if (!confirmed) {
    return;
  }
  state.goals = state.goals.filter((item) => item.id !== goalId);
  state.tasks = state.tasks.map((task) =>
    task.goalId === goalId ? { ...task, goalId: "" } : task
  );
  if (editingGoalId === goalId) {
    editingGoalId = null;
  }
  saveState();
  renderGoals();
  renderTasks();
  renderGoalOptions();
  showToast("Goal deleted.");
}

async function deleteTask(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    showToast("Task not found.");
    return;
  }
  const confirmed = await requestConfirm(`Delete task "${task.title}"?`);
  if (!confirmed) {
    return;
  }
  state.tasks = state.tasks.filter((item) => item.id !== taskId);
  if (editingTaskId === taskId) {
    editingTaskId = null;
    elements.taskForm.reset();
  }
  saveState();
  renderTasks();
  renderGoals();
  showToast("Task deleted.");
}

async function deleteSprint() {
  const confirmed = await requestConfirm("Clear the current sprint label?");
  if (!confirmed) {
    return;
  }
  state.sprint = { name: "", start: "", end: "" };
  saveState();
  renderSprint();
  showToast("Sprint cleared.");
}

async function handleMenuAction(action, id) {
  switch (action) {
    case "share-goal":
      shareGoal(id);
      break;
    case "share-task":
      shareTask(id);
      break;
    case "share-sprint":
      shareText("Study Forged Sprint", buildSummary());
      break;
    case "add-goal":
      startGoalAdd();
      break;
    case "add-task":
      startTaskAdd();
      break;
    case "add-sprint":
      openSprintDialog();
      break;
    case "delete-goal":
      await deleteGoal(id);
      break;
    case "delete-task":
      await deleteTask(id);
      break;
    case "delete-sprint":
      await deleteSprint();
      break;
    case "archive-sprint":
      await archiveSprint();
      break;
    default:
      break;
  }
}

async function archiveSprint() {
  const confirmed = await requestConfirm("Archive current sprint to history?");
  if (!confirmed) {
    return;
  }

  const snapshot = {
    archivedAt: new Date().toISOString(),
    sprint: { ...state.sprint },
    goals: [...state.goals],
    tasks: [...state.tasks],
    notes: [...state.notes],
    gauges: { ...state.gauges },
    xp: state.xp,
    level: state.level,
  };

  state.history.push(snapshot);

  // Optional: Clear board for new sprint
  const clearBoard = await requestConfirm("Start fresh? (Clears goals & tasks)");
  if (clearBoard) {
    state.sprint = { name: "", start: "", end: "" };
    state.goals = [];
    state.tasks = [];
    state.notes = [];
    state.gauges = { consistency: 0, energy: 0, retention: 0 };
  }

  saveState();
  renderAll();
  showToast("Sprint archived successfully.");
}

function handleShare() {
  const summary = buildSummary();
  shareText("Study Forged", summary);
}

function handleDownload() {
  const summary = buildSummary();
  const blob = new Blob([summary], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `study-forged-summary-${toISODate(new Date()) || "summary"}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Summary downloaded.");
}

function startGoalAdd() {
  editingGoalId = null;
  openGoalDialog();
}

function startGoalEdit(goalId) {
  editingGoalId = goalId;
  openGoalDialog();
}

function openGoalDialog() {
  const goal = editingGoalId ? state.goals.find((item) => item.id === editingGoalId) : null;
  elements.goalForm.reset();
  if (goal) {
    elements.goalDialogTitle.textContent = "Edit Goal";
    elements.goalSubmitBtn.textContent = "Update Goal";
    elements.goalTitle.value = goal.title;
    elements.goalTag.value = goal.tag;
    elements.goalProgress.value = String(getGoalProgress(goal));
  } else {
    elements.goalDialogTitle.textContent = "Add Goal";
    elements.goalSubmitBtn.textContent = "Save Goal";
    elements.goalProgress.value = "50";
  }
  updateGoalProgressLabel();
  openDialog(elements.goalDialog);
  elements.goalTitle.focus();
}

function renderGoalOptions() {
  if (!elements.taskGoal) return;
  const current = elements.taskGoal.value;
  elements.taskGoal.innerHTML = "";
  const noneOption = document.createElement("option");
  noneOption.value = "";
  noneOption.textContent = "No goal";
  elements.taskGoal.appendChild(noneOption);
  state.goals.forEach((goal) => {
    const option = document.createElement("option");
    option.value = goal.id;
    option.textContent = goal.title;
    elements.taskGoal.appendChild(option);
  });
  if (current) {
    elements.taskGoal.value = current;
  }
}

function startTaskAdd() {
  editingTaskId = null;
  openTaskDialog();
}

function startTaskEdit(taskId) {
  editingTaskId = taskId;
  openTaskDialog();
}

function openTaskDialog() {
  const task = editingTaskId ? state.tasks.find((item) => item.id === editingTaskId) : null;
  elements.taskForm.reset();
  renderGoalOptions();
  if (task) {
    elements.taskDialogTitle.textContent = "Edit Task";
    elements.taskSubmitBtn.textContent = "Update Task";
    elements.taskTitle.value = task.title;
    elements.taskDuration.value = task.duration;
    elements.taskStatus.value = task.status;
    elements.taskGoal.value = task.goalId || "";
  } else {
    elements.taskDialogTitle.textContent = "Add Task";
    elements.taskSubmitBtn.textContent = "Add Task";
    elements.taskStatus.value = "plan";
  }
  openDialog(elements.taskDialog);
  elements.taskTitle.focus();
}

function openSprintDialog() {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 6);

  elements.sprintName.value = state.sprint?.name || `Week of ${formatDateShort(today)}`;
  elements.sprintStart.value = state.sprint?.start || toISODate(today);
  elements.sprintEnd.value = state.sprint?.end || toISODate(end);
  openDialog(elements.sprintDialog);
  elements.sprintName.focus();
}

function wireEvents() {
  initSTT();
  // shareBtn was removed from the UI
  elements.newSprintBtn.addEventListener("click", openSprintDialog);
  elements.addGoalBtn.addEventListener("click", startGoalAdd);
  elements.addTaskBtn.addEventListener("click", startTaskAdd);
  elements.saveNoteBtn.addEventListener("click", (event) => {
    event.preventDefault();
    if (sttListening && stt) {
      stt.stop();
    }
    const text = elements.noteText.value.trim();
    if (!text) {
      showToast("Write a note before saving.");
      return;
    }
    const title = elements.noteTitle.value.trim() || `Session ${getNextSessionNumber()}`;
    const focus = clamp(Number(elements.noteFocus.value) || 7, 1, 10);
    if (editingNoteId) {
      const note = state.notes.find((item) => item.id === editingNoteId);
      if (note) {
        note.title = title;
        note.text = text;
        note.focus = focus;
      }
    } else {
      state.notes.unshift({
        id: createId(),
        title,
        date: formatDateShort(new Date()),
        text,
        focus,
        expanded: false,
      });
    }
    elements.noteTitle.value = "";
    elements.noteText.value = "";
    elements.noteFocus.value = "7";
    saveState();
    renderNotes();
    editingNoteId = null;
    elements.cancelNoteEditBtn.classList.remove("show");
    elements.saveNoteBtn.textContent = "Save Note";
    showToast("Note saved.");
  });

  elements.cancelNoteEditBtn.addEventListener("click", () => {
    editingNoteId = null;
    elements.noteTitle.value = "";
    elements.noteText.value = "";
    elements.noteFocus.value = "7";
    elements.cancelNoteEditBtn.classList.remove("show");
    elements.saveNoteBtn.textContent = "Save Note";
  });

  if (elements.downloadBtn) {
    elements.downloadBtn.addEventListener("click", handleDownload);
  }

  elements.goalProgress.addEventListener("input", updateGoalProgressLabel);

  elements.goalForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = elements.goalTitle.value.trim();
    if (!title) {
      showToast("Goal title is required.");
      return;
    }
    const tag = elements.goalTag.value.trim() || "Sprint goal";
    const progress = clamp(Number(elements.goalProgress.value) || 0, 0, 100);
    const isEdit = Boolean(editingGoalId);
    if (isEdit) {
      const goal = state.goals.find((item) => item.id === editingGoalId);
      if (goal) {
        goal.title = title;
        goal.tag = tag;
        goal.progress = progress;
      }
    } else {
      state.goals.unshift({
        id: createId(),
        title,
        tag,
        progress,
      });
    }
    saveState();
    renderGoals();
    renderTasks();
    renderGoalOptions();
    closeDialog(elements.goalDialog);
    elements.goalForm.reset();
    updateGoalProgressLabel();
    editingGoalId = null;
    showToast(isEdit ? "Goal updated." : "Goal added.");
  });

  elements.taskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = elements.taskTitle.value.trim();
    if (!title) {
      showToast("Task title is required.");
      return;
    }
    const duration = elements.taskDuration.value.trim() || "TBD";
    const status = elements.taskStatus.value;
    const goalId = elements.taskGoal ? elements.taskGoal.value : "";
    const isEdit = Boolean(editingTaskId);
    if (isEdit) {
      const task = state.tasks.find((item) => item.id === editingTaskId);
      if (task) {
        task.title = title;
        task.duration = duration;
        task.status = status;
        task.goalId = goalId;
      }
    } else {
      state.tasks.unshift({
        id: createId(),
        title,
        duration,
        status,
        goalId,
      });
    }
    saveState();
    renderTasks();
    renderGoals();
    closeDialog(elements.taskDialog);
    elements.taskForm.reset();
    editingTaskId = null;
    showToast(isEdit ? "Task updated." : "Task added.");
  });

  elements.sprintForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = elements.sprintName.value.trim() || `Week of ${formatDateShort(new Date())}`;
    state.sprint = {
      name,
      start: elements.sprintStart.value,
      end: elements.sprintEnd.value,
    };

    if (elements.resetGoals.checked) {
      state.goals = state.goals.map((goal) => ({ ...goal, progress: 0 }));
    }
    if (elements.resetTasks.checked) {
      state.tasks = state.tasks.map((task) => ({ ...task, status: "plan" }));
    }
    if (elements.clearNotes.checked) {
      state.notes = [];
    }
    if (elements.resetGauges.checked) {
      state.gauges = { consistency: 0, energy: 0, retention: 0 };
    }

    state.activeDay = getTodayLabel();
    saveState();
    renderAll();
    closeDialog(elements.sprintDialog);
    elements.sprintForm.reset();
    showToast("New sprint created.");
  });

  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => {
      const dialog = button.closest("dialog");
      const form = dialog ? dialog.querySelector("form") : null;
      if (form) {
        form.reset();
      }
      if (dialog === elements.goalDialog) {
        updateGoalProgressLabel();
        editingGoalId = null;
        elements.goalDialogTitle.textContent = "Add Goal";
        elements.goalSubmitBtn.textContent = "Save Goal";
      }
      if (dialog === elements.taskDialog) {
        editingTaskId = null;
        elements.taskDialogTitle.textContent = "Add Task";
        elements.taskSubmitBtn.textContent = "Add Task";
      }
      closeDialog(dialog);
    });
  });

  [elements.goalDialog, elements.taskDialog, elements.sprintDialog].forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        closeDialog(dialog);
      }
    });
  });

  elements.confirmCancel.addEventListener("click", () => resolveConfirm(false));
  elements.confirmOk.addEventListener("click", () => resolveConfirm(true));
  elements.confirmDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    resolveConfirm(false);
  });
  elements.confirmDialog.addEventListener("click", (event) => {
    if (event.target === elements.confirmDialog) {
      resolveConfirm(false);
    }
  });

  elements.notesList.addEventListener("click", (event) => {
    const editBtn = event.target.closest(".note-edit");
    if (editBtn) {
      startNoteEdit(editBtn.dataset.noteId);
      return;
    }
    const deleteBtn = event.target.closest(".note-delete");
    if (deleteBtn) {
      deleteNote(deleteBtn.dataset.noteId);
      return;
    }
    const button = event.target.closest(".expand-btn");
    if (!button) return;
    const note = state.notes.find((item) => item.id === button.dataset.id);
    if (!note) return;
    note.expanded = !note.expanded;
    saveState();
    renderNotes();
  });

  const taskBoard = document.querySelector(".taskboard");
  taskBoard.addEventListener("click", (event) => {
    if (event.target.closest(".task-edit")) {
      startTaskEdit(event.target.closest(".task-edit").dataset.taskId);
      return;
    }
    if (event.target.closest(".task-delete")) {
      deleteTask(event.target.closest(".task-delete").dataset.taskId);
      return;
    }
    if (event.target.closest(".menu") || event.target.closest(".card-actions")) {
      return;
    }
    const card = event.target.closest(".task-card");
    if (!card) return;
    cycleTaskStatus(card.dataset.id);
  });

  taskBoard.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest(".menu") || event.target.closest(".card-actions")) {
      return;
    }
    const card = event.target.closest(".task-card");
    if (!card) return;
    event.preventDefault();
    cycleTaskStatus(card.dataset.id);
  });

  taskBoard.addEventListener("dragstart", (event) => {
    const card = event.target.closest(".task-card");
    if (!card) return;
    if (event.target.closest(".menu") || event.target.closest(".card-actions")) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData("text/plain", card.dataset.id);
    event.dataTransfer.effectAllowed = "move";
    card.classList.add("dragging");
  });

  taskBoard.addEventListener("dragend", (event) => {
    const card = event.target.closest(".task-card");
    if (card) {
      card.classList.remove("dragging");
    }
    document.querySelectorAll(".column.drag-over").forEach((column) => {
      column.classList.remove("drag-over");
    });
  });

  taskBoard.addEventListener("dragover", (event) => {
    const column = event.target.closest(".column");
    if (!column) return;
    event.preventDefault();
    column.classList.add("drag-over");
  });

  taskBoard.addEventListener("dragleave", (event) => {
    const column = event.target.closest(".column");
    if (!column) return;
    column.classList.remove("drag-over");
  });

  taskBoard.addEventListener("drop", (event) => {
    const column = event.target.closest(".column");
    if (!column) return;
    event.preventDefault();
    column.classList.remove("drag-over");
    const taskId = event.dataTransfer.getData("text/plain");
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return;
    const newStatus = column.dataset.status;
    if (newStatus && task.status !== newStatus) {
      task.status = newStatus;
      saveState();
      renderTasks();
      renderGoals();
      showToast(`Task moved to ${newStatus.replace("progress", "in progress")}.`);
    }
  });

  elements.goalsList.addEventListener("click", (event) => {
    if (event.target.closest(".goal-edit")) {
      startGoalEdit(event.target.closest(".goal-edit").dataset.goalId);
      return;
    }
    if (event.target.closest(".goal-delete")) {
      deleteGoal(event.target.closest(".goal-delete").dataset.goalId);
    }
  });

  if (elements.timeline) {
    elements.timeline.addEventListener("click", (event) => {
      const tick = event.target.closest(".tick");
      if (!tick) return;
      state.activeDay = tick.dataset.day;
      saveState();
      renderTimeline();
    });

    elements.timeline.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const tick = event.target.closest(".tick");
      if (!tick) return;
      event.preventDefault();
      state.activeDay = tick.dataset.day;
      saveState();
      renderTimeline();
    });
  }

  document.querySelectorAll(".syl-jump-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const targetId = btn.getAttribute("data-target-card");
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        e.preventDefault();
        targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
        targetEl.classList.add("syl-card-focused");
        setTimeout(() => targetEl.classList.remove("syl-card-focused"), 750);
      }
    });
  });

  const sylDownloadBtn = document.getElementById("sylDownloadPdfBtn");
  if (sylDownloadBtn) {
    sylDownloadBtn.addEventListener("click", () => {
      if (typeof showToast === "function") {
        showToast("Downloading Official Syllabus PDF...");
      }
    });
  }

  document.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    spawnClickEffect(event.clientX, event.clientY);
  }, { passive: true });

  document.addEventListener("click", (event) => {
    const menuButton = event.target.closest(".menu-button");
    if (menuButton) {
      event.preventDefault();
      event.stopPropagation();
      const menu = menuButton.closest(".menu");
      if (!menu) return;
      const isOpen = menu.classList.contains("open");
      closeMenus(menu);
      if (!isOpen) {
        menu.classList.add("open");
        menuButton.setAttribute("aria-expanded", "true");
      } else {
        menu.classList.remove("open");
        menuButton.setAttribute("aria-expanded", "false");
      }
      return;
    }

    const menuItem = event.target.closest(".menu-item");
    if (menuItem) {
      event.preventDefault();
      event.stopPropagation();
      const menu = menuItem.closest(".menu");
      const targetId = menu ? menu.dataset.id : undefined;
      handleMenuAction(menuItem.dataset.action, targetId);
      closeMenus();
      return;
    }

    closeMenus();
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenus();
    }
  });
}

const elements = {
  sprintLabel: document.getElementById("sprintLabel"),
  goalsList: document.getElementById("goalsList"),
  planList: document.getElementById("planList"),
  progressList: document.getElementById("progressList"),
  doneList: document.getElementById("doneList"),
  notesList: document.getElementById("notesList"),
  timeline: document.getElementById("timeline"),
  toast: document.getElementById("toast"),

  newSprintBtn: document.getElementById("newSprintBtn"),
  addGoalBtn: document.getElementById("addGoalBtn"),
  addTaskBtn: document.getElementById("addTaskBtn"),
  saveNoteBtn: document.getElementById("saveNoteBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  goalDialog: document.getElementById("goalDialog"),
  taskDialog: document.getElementById("taskDialog"),
  sprintDialog: document.getElementById("sprintDialog"),
  confirmDialog: document.getElementById("confirmDialog"),
  confirmMessage: document.getElementById("confirmMessage"),  confirmCancel: document.getElementById("confirmCancel"),
  confirmOk: document.getElementById("confirmOk"),
  goalDialogTitle: document.getElementById("goalDialogTitle"),
  goalSubmitBtn: document.getElementById("goalSubmitBtn"),
  taskDialogTitle: document.getElementById("taskDialogTitle"),
  taskSubmitBtn: document.getElementById("taskSubmitBtn"),
  goalForm: document.getElementById("goalForm"),
  taskForm: document.getElementById("taskForm"),
  sprintForm: document.getElementById("sprintForm"),
  goalTitle: document.getElementById("goalTitle"),
  goalTag: document.getElementById("goalTag"),
  goalProgress: document.getElementById("goalProgress"),
  goalProgressValue: document.getElementById("goalProgressValue"),
  taskTitle: document.getElementById("taskTitle"),
  taskDuration: document.getElementById("taskDuration"),
  taskGoal: document.getElementById("taskGoal"),
  taskStatus: document.getElementById("taskStatus"),
  sprintName: document.getElementById("sprintName"),
  sprintStart: document.getElementById("sprintStart"),
  sprintEnd: document.getElementById("sprintEnd"),
  resetGoals: document.getElementById("resetGoals"),
  resetTasks: document.getElementById("resetTasks"),
  clearNotes: document.getElementById("clearNotes"),
  resetGauges: document.getElementById("resetGauges"),
  sttBtn: document.getElementById("sttBtn"),
  sttStatus: document.getElementById("sttStatus"),
  cancelNoteEditBtn: document.getElementById("cancelNoteEditBtn"),
  clickFx: document.getElementById("clickFx"),
  noteTitle: document.getElementById("noteTitle"),
  noteFocus: document.getElementById("noteFocus"),
  noteText: document.getElementById("noteText"),
  xpBarFill: document.getElementById("xpBarFill"),
  xpLabel: document.getElementById("xpLabel"),
  streakBadge: document.getElementById("streakBadge"),

  // Calendar Elements
  calendarDialog: document.getElementById("calendarDialog"),
  calendarBtn: document.getElementById("calendarBtn"),
  prevMonthBtn: document.getElementById("prevMonthBtn"),
  nextMonthBtn: document.getElementById("nextMonthBtn"),
  currentMonthLabel: document.getElementById("currentMonthLabel"),
  calendarGrid: document.getElementById("calendarGrid"),
  dayPreview: document.getElementById("dayPreview"),
};

let state = loadState();
let editingGoalId = null;
let editingTaskId = null;
let editingNoteId = null;

// Calendar State
let calendarDate = new Date();
let selectedDate = new Date();

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  if (!elements.currentMonthLabel || !elements.calendarGrid) return;

  elements.currentMonthLabel.textContent = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(calendarDate);
  elements.calendarGrid.innerHTML = "";

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  // Empty cells for previous month
  for (let i = 0; i < firstDay; i++) {
    const cell = document.createElement("div");
    elements.calendarGrid.appendChild(cell);
  }

  // Days
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const cell = document.createElement("div");
    cell.className = "calendar-day";
    cell.dataset.date = dateStr;

    if (isCurrentMonth && day === today.getDate()) {
      cell.classList.add("today");
    }

    if (selectedDate &&
      selectedDate.getFullYear() === year &&
      selectedDate.getMonth() === month &&
      selectedDate.getDate() === day) {
      cell.classList.add("selected");
    }

    const dayNumber = document.createElement("span");
    dayNumber.className = "day-number";
    dayNumber.textContent = day;
    cell.appendChild(dayNumber);

    // Check for activity
    const hasTasks = state.tasks.some(t => t.duration.includes(dateStr) || (t.status === 'done' && t.completedAt?.startsWith(dateStr))); // Simplified check
    // Accurate logic: check if tasks are within sprint or specific due date
    // For now, let's just mark if there's a note for this day

    // Better logic:
    // Notes on this day?
    // Tasks due/done on this day? (We need to add a due date field properly later, using creation/sprint for now)

    const noteCount = state.notes.filter(n => n.date.includes(formatDateShort(new Date(dateStr)))).length;
    // Check if date matches Note date format "Feb 9"
    const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(dateStr));
    const hasNotes = state.notes.some(n => n.date === shortDate);

    if (hasNotes) {
      const dots = document.createElement("div");
      dots.className = "day-dots";
      const dot = document.createElement("div");
      dot.className = "dot note";
      dots.appendChild(dot);
      cell.appendChild(dots);
    }

    cell.addEventListener("click", () => {
      selectedDate = new Date(year, month, day);
      renderCalendar(); // Re-render to update selection
      renderDayPreview(dateStr);
    });

    elements.calendarGrid.appendChild(cell);
  }
}

function renderDayPreview(dateStr) {
  if (!elements.dayPreview) return;
  const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(dateStr));
  const notes = state.notes.filter(n => n.date === shortDate);
  // Tasks don't have exact dates yet, so we'll just show notes for now.
  // v32: build with textContent so note titles can never run as HTML.
  elements.dayPreview.innerHTML = "";
  const head = document.createElement("h3");
  head.textContent = shortDate;
  elements.dayPreview.appendChild(head);
  if (notes.length === 0) {
    const p = document.createElement("p");
    p.textContent = "No activity recorded.";
    elements.dayPreview.appendChild(p);
    return;
  }
  const list = document.createElement("div");
  list.className = "preview-list";
  notes.forEach(note => {
    const item = document.createElement("div");
    item.className = "preview-item note";
    const title = document.createElement("span");
    title.textContent = note.title;
    const kind = document.createElement("span");
    kind.textContent = "Note";
    item.append(title, kind);
    list.appendChild(item);
  });
  elements.dayPreview.appendChild(list);
}

function wireCalendarEvents() {
  const calendarBtn = document.getElementById("calendarBtn");
  const prevMonthBtn = document.getElementById("prevMonthBtn");
  const nextMonthBtn = document.getElementById("nextMonthBtn");
  const calendarDialog = document.getElementById("calendarDialog");

  if (calendarBtn) {
    calendarBtn.addEventListener("click", () => {
      calendarDate = new Date(); // Reset to today
      selectedDate = new Date();
      renderCalendar();
      renderDayPreview(toISODate(new Date()));
      if (calendarDialog) calendarDialog.showModal();
    });
  }

  if (prevMonthBtn) {
    prevMonthBtn.addEventListener("click", () => {
      calendarDate.setMonth(calendarDate.getMonth() - 1);
      renderCalendar();
    });
  }

  if (nextMonthBtn) {
    nextMonthBtn.addEventListener("click", () => {
      calendarDate.setMonth(calendarDate.getMonth() + 1);
      renderCalendar();
    });
  }

  console.log("Calendar events wired", { calendarBtn, prevMonthBtn, nextMonthBtn });
}

// ─── Bottom Navigation Tab Switching ───
function initBottomNav() {
  const tabs = document.querySelectorAll('.nav-tab');
  const panels = document.querySelectorAll('.panel[data-page]');
  const tabOrder = ['goals', 'tasks', 'timetable', 'notes', 'snapshot'];
  let currentTab = 'goals';

  function switchTab(targetPage) {
    if (targetPage === currentTab) return;

    const oldIndex = tabOrder.indexOf(currentTab);
    const newIndex = tabOrder.indexOf(targetPage);
    const direction = newIndex > oldIndex ? 'right' : 'left';

    // Hide all panels & remove animation classes
    panels.forEach(p => {
      p.classList.remove('active-page', 'slide-in-left', 'slide-in-right');
    });
    // Remove active from all tabs
    tabs.forEach(t => t.classList.remove('active'));

    // Show target panel with slide animation
    const targetPanel = document.querySelector(`.panel[data-page="${targetPage}"]`);
    if (targetPanel) {
      targetPanel.classList.add('active-page', `slide-in-${direction}`);
    }

    // Mark target tab active
    const targetTab = document.querySelector(`.nav-tab[data-target="${targetPage}"]`);
    if (targetTab) targetTab.classList.add('active');

    currentTab = targetPage;
    localStorage.setItem('activeTab', targetPage);
    // v0.6.18: each panel opens at its top — leftover scroll from a taller panel
    // otherwise clamps the new (shorter) panel straight to its bottom.
    scrollPageToTop();
  }

  // Wire click events
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.target);
    });
  });

  // Always land on the timetable (default opening).
  panels.forEach(p => p.classList.remove('active-page'));
  tabs.forEach(t => t.classList.remove('active'));
  const homePanel = document.querySelector('.panel[data-page="timetable"]');
  const homeTab = document.querySelector('.nav-tab[data-target="timetable"]');
  if (homePanel) homePanel.classList.add('active-page');
  if (homeTab) homeTab.classList.add('active');
  currentTab = 'timetable';
  localStorage.setItem('activeTab', 'timetable');
}

// ─── AI Gateway Architecture (Vercel AI Gateway) ───
const DEFAULT_AI_PROVIDER = 'vercel';

function getActiveAiProvider() {
  return 'vercel';
}

function setActiveAiProvider(provider) {
  localStorage.setItem('sf_ai_provider', 'vercel');
}

// ── Vercel AI Gateway (server-side proxy · meta/muse-ember only) ──
// The browser never holds a gateway key. /api/ai/* injects it server-side.
function getVercelApiUrl() {
  return '/api/ai/chat/completions';
}
const VERCEL_API_URL = getVercelApiUrl();
const DEFAULT_VERCEL_MODEL = 'meta/muse-ember';

// Kept for backward compatibility with old call sites; server auth means no client key.
function getVercelApiKey() {
  return '';
}

function getVercelModel() {
  return DEFAULT_VERCEL_MODEL;
}

// ── Unified Active Provider Resolvers ──
function getActiveAiApiUrl() {
  return VERCEL_API_URL;
}

function getActiveAiApiKey() {
  return '';
}

function getActiveAiModel() {
  return DEFAULT_VERCEL_MODEL;
}

function getActiveAiApiFallbackUrl() {
  // Server-side proxy only: there is no keyless direct-gateway fallback.
  return VERCEL_API_URL;
}

// Dead/plan-gated model IDs fail in every tool at once — detect and explain.
function isModelMissingError(msg) {
  const m = String(msg || '').toLowerCase();
  return /model[^.]{0,60}(not found|does not exist|doesn.?t exist|invalid|unsupported|unknown|no such)/i.test(m) || /(^|[^0-9])404([^0-9]|$)/.test(m);
}
function healDeadModel() {
  showToast(`AI model unavailable on the server — please try again shortly.`);
  return false;
}

// Backward-compatibility aliases
const getOpenRouterApiKey = getActiveAiApiKey;
const getOpenRouterModel = getActiveAiModel;
const OPENROUTER_API_URL = VERCEL_API_URL;

function updateAIModelBadge() {
  const badge = document.getElementById('aiModelBadge');
  if (badge) {
    const model = getActiveAiModel();
    let label = model;
    if (label.startsWith('meta/')) label = label.replace('meta/', '');
    if (label.startsWith('google/')) label = label.replace('google/', '');
    if (label.startsWith('openai/')) label = label.replace('openai/', '');
    if (label.startsWith('anthropic/')) label = label.replace('anthropic/', '');
    if (label.startsWith('deepseek/')) label = label.replace('deepseek/', '');
    label = label.replace(':free', ' (FREE)');
    badge.textContent = label.toUpperCase();
    badge.title = `Vercel AI Gateway: ${model}`;
  }
  try {
    const sel = document.getElementById('aiModelSelect');
    if (sel) {
      const curModel = getActiveAiModel();
      const has = Array.prototype.some.call(sel.options, (o) => o.value === curModel);
      sel.value = has ? curModel : 'meta/muse-ember';
    }
  } catch (e) {}
}

const AI_SYSTEM_PROMPT = `You are StudyForged, the dedicated AI academic tutor & exam coach for Satyam Kumar, 1st-year B.Tech IT at ADGIPS (GGSIPU, Delhi), Sec E, Room 2310 (AY 2026–27).
ACADEMIC BLUEPRINT:
1. GGSIPU 2026 Exam Pattern: 40 Continuous Internal Evaluation + 60 Term-End Exam (Q1 compulsory 12m full-syllabus; 4 Units × 12m, attempt 1 of 2 questions per unit). EVS (ICT-117T) is 100-mark NUES (Non-University Exam System, Qualifying).
2. Grounding: All answers MUST strictly follow the official ADGIPS/GGSIPU 2026 curriculum and prescribed textbooks (Kreyszig for SMT, Tayal for EM, Alexander & Sadiku for BEE, Kernighan & Ritchie/Jens Gustedt for PPS, Erach Bharucha for EVS).
DIRECTIVES:
1. Identity: You are StudyForged tutor. Never break character.
2. Math & Formulas: Use standard KaTeX notation (inline \\( ... \\), display \\[ ... \\]).
3. Code: When writing PPS code, use clean, standards-compliant C (C99/C11/C23 with type safety).
4. Structure: Core Concept -> Step-by-Step Breakdown/Derivation/Code -> Exam Trap & Viva Pointer.
5. Speed & Conciseness: Keep responses crisp, high-yield, encouraging, and under 250–350 words. No boilerplate pleasantries.`;

function escRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SF_ALIAS_HINTS = {
  "PPS": ["PROGRAMMING", "C LANGUAGE", "POINTER", "POINTERS", "MALLOC", "CALLOC", "RECURSION", "STRUCT", "STRUCTURE", "ARRAY", "ARRAYS", "LINKED LIST", "STACK", "QUEUE", "BINARY SEARCH", "SORTING", "FILE I/O", "ANKIT JAIN", "ALKA", "C23", "THREAD_LOCAL", "_GENERIC", "_STATIC_ASSERT"],
  "SMT": ["MATHS", "MATHEMATICS", "DERIVATIVE", "PARTIAL DERIVATIVE", "MAXIMA", "MINIMA", "LAGRANGE", "JACOBIAN", "TAYLOR", "DIFFERENTIAL", "ODE", "GAMMA", "BETA", "BESSEL", "LEGENDRE", "MATRIX", "MATRICES", "EIGENVALUE", "EIGENVECTOR", "SVD", "GRADIENT", "DIVERGENCE", "CURL", "GREEN", "STOKES", "GAUSS", "SURYYA FARHAT", "RENU", "LEIBNIZ", "CHOLESKY", "GRAM-SCHMIDT", "WRONSKIAN", "CAUCHY-EULER", "DIRECTION FIELDS"],
  "EM": ["MECHANICS", "STATICS", "EQUILIBRIUM", "VARIGNON", "FREE BODY", "FBD", "TRUSS", "TRUSSES", "FRICTION", "REPOSE", "KINEMATICS", "KINETICS", "IMPULSE", "MOMENTUM", "RESTITUTION", "CENTROID", "MOMENT OF INERTIA", "NAMAN BAJPAI", "BELT FRICTION", "COLLAR BEARING", "PIVOT", "CORIOLIS", "COUPLE"],
  "BEE": ["ELECTRICAL", "CIRCUIT", "CIRCUITS", "KCL", "KVL", "OHM", "SOURCE TRANSFORMATION", "THEVENIN", "NORTON", "SUPERPOSITION", "MAX POWER", "TRANSIENT", "RL", "RC", "PHASOR", "IMPEDANCE", "POWER FACTOR", "3-PHASE", "TRANSFORMER", "MOTOR", "INDUCTION", "POOJA", "DIGITAL INFRASTRUCTURE", "ENERGY AUDITING", "STEP RESPONSE"],
  "PHL": ["PHYSICS", "SEMICONDUCTOR", "SEMICONDUCTORS", "CRYSTAL", "MILLER", "ENERGY BAND", "DRIFT", "DIFFUSION", "PN JUNCTION", "ZENER", "SCHOTTKY", "TUNNEL", "BJT", "JFET", "MOSFET", "LED", "PHOTODIODE", "SOLAR CELL", "LASER", "FABRICATION", "MAMTA GUPTA"],
  "CSL": ["ENGLISH", "COMMUNICATION", "GRAMMAR", "PARTS OF SPEECH", "PRÉCIS", "PRECIS", "PARAGRAPH", "NOTICE", "MINUTES", "MEMO", "EMAIL", "PHONETICS", "SAMIKSHYA"],
  "EVSL": ["EVS", "ENVIRONMENT", "ECOLOGY", "ECOSYSTEM", "BIODIVERSITY", "POLLUTION", "E-WASTE", "GLOBAL WARMING", "DISASTER", "EIA", "SDG", "KAVITA GUPTA", "ANTHROPOCENTRISM", "BIOCENTRISM", "ECOCENTRISM", "DEEP ECOLOGY"],
  "PD": ["PERSONALITY", "SOFT SKILLS", "INTERVIEW", "RESUME", "GD", "GROUP DISCUSSION", "IMPROMPTU", "CORPORATE ETIQUETTE", "SAMIKSHYA"],
  "EGL": ["GRAPHICS", "DRAWING", "PROJECTION", "ORTHOGRAPHIC", "ISOMETRIC", "SCALE", "CONIC", "CAD", "AUTOCAD", "DRAFTING", "NAMAN BAJPAI"]
};

function trimmedBuddyBlock(userText) {
  if (typeof SF_SEM1_SUBJECTS === "undefined" || !Array.isArray(SF_SEM1_SUBJECTS)) return "";
  const text = String(userText || "");
  const matched = SF_SEM1_SUBJECTS.filter((s) => {
    const keys = [s.alias].concat(SF_ALIAS_HINTS[s.alias] || []);
    return keys.some((k) => {
      try { return new RegExp(`\\b${escRegExp(k)}\\b`, "i").test(text); }
      catch (e) { return false; }
    });
  });
  if (!matched.length) {
    return "Sem-1 Focus: PPS (C Prog), SMT (Maths-I), BEE (Electrical), PHL (Physics), EM (Mechanics), CSL, EVSL, EGL.";
  }
  if (matched.length > 2) {
    return "Active Subjects: " + matched.map(s => `${s.alias} (${s.name}) [Faculty: ${SF_FACULTY[s.alias]?.faculty || 'Faculty'}]`).join("; ");
  }
  return matched.map(s => {
    const fac = SF_FACULTY[s.alias]?.faculty ? ` · Faculty: ${SF_FACULTY[s.alias].faculty}` : '';
    const units = s.units ? ` · Units: ${s.units.map(u => u.split(':')[0]).join(', ')}` : '';
    return `🎯 Target Subject: ${s.alias} (${s.code}): ${s.name}${fac}${units}`;
  }).join("\n");
}

// Markdown + LaTeX math to HTML
// v32: escape raw <>& first so AI/user text can never inject HTML.
// Code fences are extracted before escaping; KaTeX output is trusted.
// v0.6.7: skipMath fast-path for SSE streaming — skips KaTeX per-frame (CPU heavy on phones).
// Final render always uses full math; streaming uses plain markdown for snappy 35ms frames.
// v0.6.22: strip markdown/KaTeX/emoji so TTS reads words, not "star/hash/backslash".
function toSpokenText(md) {
  let s = String(md == null ? "" : md);
  // Code fences → keep content inline, drop fence markers.
  s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => ` ${(String(code || '').trim().replace(/\s+/g, ' '))} `);
  // KaTeX display/inline → inner math first.
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => ` ${m} `);
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (_, m) => ` ${m} `);
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => ` ${m} `);
  // Speak common LaTeX in words, then drop remaining commands/braces.
  const mathWords = { times: 'times', cdot: 'times', div: 'divided by', pm: 'plus or minus', le: 'less than or equal to', ge: 'greater than or equal to', ne: 'not equal to', approx: 'approximately', infty: 'infinity', rightarrow: 'gives', leftarrow: 'from', Rightarrow: 'implies', sum: 'sum of', prod: 'product of', int: 'integral of', sqrt: 'square root of', frac: '', text: '', mathrm: '', mathbf: '', boldsymbol: '', vec: 'vector ', to: 'to', alpha: 'alpha', beta: 'beta', gamma: 'gamma', delta: 'delta', theta: 'theta', lambda: 'lambda', mu: 'mu', pi: 'pi', sigma: 'sigma', omega: 'omega' };
  s = s.replace(/\\([a-zA-Z]+)/g, (_, cmd) => (cmd in mathWords ? ` ${mathWords[cmd]} ` : ' '));
  s = s.replace(/[{}$^_~]/g, ' ');
  // Markdown links/images → visible text only.
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  // Headers, quotes, list markers, rules, bold/italic/strike/code marks.
  s = s.replace(/^#{1,6}\s+/gm, '');
  s = s.replace(/(^|\s)#(?=\s|$)/g, '$1');
  s = s.replace(/^>\s?/gm, '');
  s = s.replace(/^(\d+)[.)]\s+/gm, '');
  s = s.replace(/^[-•*+]\s+/gm, '');
  s = s.replace(/^(\*{3,}|-{3,}|_{3,})\s*$/gm, '');
  s = s.replace(/(\*\*|__)(.*?)\1/g, '$2');
  // Unspaced a*b and spaced digit 2 * 3 are multiplication; spaced *word* stays italic.
  s = s.replace(/(\w)\*(\w)/g, '$1 times $2');
  s = s.replace(/(\d)\s+\*\s+(\d)/g, '$1 times $2');
  s = s.replace(/(^|[\s(])[*_]([^*_]+)[*_]/g, '$1$2');
  s = s.replace(/~~(.*?)~~/g, '$1');
  s = s.replace(/`([^`]*)`/g, '$1');
  // Raw URLs, then comparisons/arrows as words (chat markdown has no real HTML tags).
  s = s.replace(/https?:\/\/\S+/g, ' ');
  s = s.replace(/-{1,2}>/g, ' to ');
  s = s.replace(/</g, ' less than ');
  s = s.replace(/>/g, ' greater than ');
  s = s.replace(/&/g, ' and ');
  s = s.replace(/\|/g, ', ');
  s = s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, ' ');
  s = s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

function mdToHtml(text, skipMath) {
  // 1. Protect code blocks from being processed
  const codeBlocks = [];
  text = String(text == null ? "" : text).replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    codeBlocks.push(`<pre><code class="lang-${escapeHtml(lang || 'text')}">${escapeHtml(code).trim()}</code></pre>`);
    return `%%CODEBLOCK_${codeBlocks.length - 1}%%`;
  });
  text = escapeHtml(text);

  function unescapeKatex(str) {
    return String(str || '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }

  // 2. Render LaTeX math using KaTeX (if available)
  // skipMath=true: streaming fast-path — skip CPU-heavy KaTeX per frame, final render restores it.
  if (!skipMath && typeof katex !== 'undefined') {
    // Display math: \[ ... \] or $$ ... $$
    text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => {
      const clean = unescapeKatex(math.trim());
      try { return `<div class="math-block">${katex.renderToString(clean, { displayMode: true, throwOnError: false })}</div>`; }
      catch { return `<div class="math-block math-error">${math}</div>`; }
    });
    text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
      const clean = unescapeKatex(math.trim());
      try { return `<div class="math-block">${katex.renderToString(clean, { displayMode: true, throwOnError: false })}</div>`; }
      catch { return `<div class="math-block math-error">${math}</div>`; }
    });
    // Inline math: \( ... \) or $ ... $
    text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => {
      const clean = unescapeKatex(math.trim());
      try { return katex.renderToString(clean, { displayMode: false, throwOnError: false }); }
      catch { return `<span class="math-error">${math}</span>`; }
    });
    text = text.replace(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g, (_, math) => {
      const clean = unescapeKatex(math.trim());
      try { return katex.renderToString(clean, { displayMode: false, throwOnError: false }); }
      catch { return `<span class="math-error">${math}</span>`; }
    });
    // Auto-render naked LaTeX math commands if LLM omitted dollar wrappers
    text = text.replace(/(\\texttt\{[^{}]*\}|\\rightarrow|\\leftarrow|\\Rightarrow|\\Leftarrow)/g, (cmd) => {
      const clean = unescapeKatex(cmd.trim());
      try { return katex.renderToString(clean, { displayMode: false, throwOnError: false }); }
      catch { return cmd; }
    });
  }

  // 3. Standard markdown
  text = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>');

  // 4. Process lines for lists and paragraphs
  const lines = text.split('\n');
  let html = '';
  let inOl = false, inUl = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const olMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
    const ulMatch = trimmed.match(/^[-•*]\s+(.+)/);

    if (olMatch) {
      if (!inOl) { if (inUl) { html += '</ul>'; inUl = false; } html += '<ol>'; inOl = true; }
      html += `<li>${olMatch[2]}</li>`;
    } else if (ulMatch) {
      if (!inUl) { if (inOl) { html += '</ol>'; inOl = false; } html += '<ul>'; inUl = true; }
      html += `<li>${ulMatch[1]}</li>`;
    } else {
      if (inOl) { html += '</ol>'; inOl = false; }
      if (inUl) { html += '</ul>'; inUl = false; }
      if (trimmed === '') {
        html += '<br>';
      } else {
        html += `<p>${trimmed}</p>`;
      }
    }
  }
  if (inOl) html += '</ol>';
  if (inUl) html += '</ul>';

  // 5. Restore code blocks
  codeBlocks.forEach((block, i) => {
    html = html.replace(`%%CODEBLOCK_${i}%%`, block);
    html = html.replace(`<p>%%CODEBLOCK_${i}%%</p>`, block);
  });

  return html;
}

function initAskAI() {
  const searchBar = document.getElementById('aiSearchBar');
  const aiPage = document.getElementById('aiPage');
  const backBtn = document.getElementById('aiBackBtn');
  const chatInput = document.getElementById('aiChatInput');
  const micBtn = document.getElementById('aiChatMicBtn');
  const sendBtn = document.getElementById('aiSendBtn');
  const chatArea = document.getElementById('aiChatArea');
  const bottomNav = document.getElementById('bottomNav');

  if (!searchBar || !aiPage) return;

  const CHAT_STORAGE_KEY = 'sf_ai_chats';
  const ACTIVE_CHAT_KEY = 'sf_ai_active_chat';

  // History sidebar elements
  const historyBtn = document.getElementById('aiHistoryBtn');
  const historySidebar = document.getElementById('aiHistorySidebar');
  const historyOverlay = document.getElementById('aiHistoryOverlay');
  const historyClose = document.getElementById('aiHistoryClose');
  const historyList = document.getElementById('aiHistoryList');
  const historyClear = document.getElementById('aiHistoryClear');
  const newChatBtn = document.getElementById('aiNewChatBtn');

  // Conversation state
  let chatHistory = [];
  let currentChatId = null;
  let thinkingMode = false;

  // Thinking mode removed for speed — always fast path. Hide the toggle.
  const thinkToggle = document.getElementById('aiThinkToggle');
  if (thinkToggle) thinkToggle.style.display = 'none';

  // ── Unified Cloud AI Integration (Vercel AI Gateway · meta/muse-ember) ──
  updateAIModelBadge();

  // Purge legacy client-side AI credentials now that the gateway is server-side.
  try {
    localStorage.removeItem('sf_tokenharbor_api_key');
    localStorage.removeItem('sf_tokenharbor_model');
    localStorage.removeItem('sf_openrouter_api_key');
    localStorage.removeItem('sf_openrouter_model');
    localStorage.removeItem('sf_deepseek_api_key');
    localStorage.removeItem('sf_vercel_ai_key');
    localStorage.removeItem('sf_vercel_ai_model');
    localStorage.removeItem('sf_ai_api_key');
    localStorage.removeItem('sf_ai_model');
    localStorage.removeItem('sf_ai_provider');
  } catch (e) {}

  // ── Multimodal Vision Controls ──
  const imageBtn = document.getElementById('aiImageBtn');
  const imageInput = document.getElementById('aiImageInput');
  const imagePreviewTray = document.getElementById('aiImagePreviewTray');
  const previewImg = document.getElementById('aiPreviewImg');
  const previewRemoveBtn = document.getElementById('aiPreviewRemoveBtn');

  let attachedImageBase64 = null;

  function setAttachedImage(dataUrl) {
    attachedImageBase64 = dataUrl;
    if (previewImg) previewImg.src = dataUrl;
    if (imagePreviewTray) imagePreviewTray.style.display = 'flex';
    if (chatInput) chatInput.placeholder = "Ask about this image (or press Send)...";
  }

  function clearAttachedImage() {
    attachedImageBase64 = null;
    if (previewImg) previewImg.src = '';
    if (imagePreviewTray) imagePreviewTray.style.display = 'none';
    if (imageInput) imageInput.value = '';
    if (chatInput) chatInput.placeholder = "Ask anything or paste an image...";
  }

  function processImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const maxDim = 1200;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setAttachedImage(dataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  if (imageBtn && imageInput) {
    imageBtn.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) processImageFile(file);
    });
  }

  if (previewRemoveBtn) {
    previewRemoveBtn.addEventListener('click', clearAttachedImage);
  }

  // Paste image directly from clipboard
  document.addEventListener('paste', (e) => {
    if (!aiPage.classList.contains('open')) return;
    const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          processImageFile(file);
          e.preventDefault();
          break;
        }
      }
    }
  });

  // ── Chat Mic Handler (Deepgram) ──
  if (micBtn) {
    let chatRecorder = null;
    let chatChunks = [];
    let isRecording = false;

    micBtn.addEventListener('click', async () => {
      if (isRecording) {
        if (chatRecorder && chatRecorder.state !== 'inactive') chatRecorder.stop();
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        chatRecorder = new MediaRecorder(stream);
        chatChunks = [];

        chatRecorder.ondataavailable = e => chatChunks.push(e.data);

        chatRecorder.onstop = async () => {
          micBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/></svg>`;
          micBtn.classList.remove('recording');
          chatInput.placeholder = "Transcribing with Deepgram...";
          const blob = new Blob(chatChunks, { type: 'audio/webm' });
          const text = await deepgramTranscribe(blob);
          if (text) {
            chatInput.value = text;
          }
          chatInput.placeholder = "Type your question...";
          isRecording = false;
          stream.getTracks().forEach(t => t.stop());
        };

        chatRecorder.start();
        isRecording = true;
        micBtn.innerHTML = '⏹';
        micBtn.classList.add('recording');
      } catch (err) {
        console.error(err);
        showToast('Mic access error');
      }
    });
  }

  // ── Persistence helpers ──
  function isValidAssistantMsg(m) {
    if (!m || m.role !== 'assistant') return false;
    const content = typeof m.content === 'string' ? m.content.trim() : '';
    return content.length > 0 && !content.startsWith('⚠️ Error:') && !content.startsWith('⏹ Generation stopped');
  }

  function getAllChats() {
    try {
      const raw = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || '[]');
      // Strictly purge any chats that are empty or contain only unanswered user prompts
      const valid = raw.filter(c => {
        return Array.isArray(c.messages) && c.messages.some(isValidAssistantMsg);
      });
      if (valid.length !== raw.length) {
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(valid));
      }
      return valid;
    } catch { return []; }
  }

  function saveAllChats(chats) {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chats));
  }

  function saveCurrentChat() {
    if (!currentChatId || chatHistory.length === 0) return;
    const hasAssistant = chatHistory.some(isValidAssistantMsg);
    const chats = getAllChats();

    // Never persist chats that only have unanswered user messages or failed attempts
    if (!hasAssistant) {
      const filtered = chats.filter(c => c.id !== currentChatId);
      if (filtered.length !== chats.length) {
        saveAllChats(filtered);
      }
      return;
    }

    const idx = chats.findIndex(c => c.id === currentChatId);
    let title = 'New Chat';
    const firstUserMsg = chatHistory.find(m => m.role === 'user');
    if (firstUserMsg) {
      if (typeof firstUserMsg.content === 'string') {
        title = firstUserMsg.content.substring(0, 40);
      } else if (Array.isArray(firstUserMsg.content)) {
        const textPart = firstUserMsg.content.find(p => p.type === 'text');
        title = textPart ? textPart.text.substring(0, 40) : '📷 Study Image';
      }
    }
    const chatObj = {
      id: currentChatId,
      title: title,
      timestamp: Date.now(),
      messages: chatHistory
    };
    if (idx >= 0) {
      chats[idx] = chatObj;
    } else {
      chats.unshift(chatObj);
    }
    saveAllChats(chats);
    localStorage.setItem(ACTIVE_CHAT_KEY, currentChatId);
  }

  // ── Dynamic Gemini/ChatGPT Style Welcome Screen ──
  function buildWelcomeHTML() {
    const name = (state.profile && state.profile.name) ? state.profile.name : 'Satyam';
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    const agenda = typeof getTodayAgenda === 'function' ? getTodayAgenda(state, new Date()) : null;
    const dayName = agenda ? agenda.day : 'Today';
    const isWeekend = agenda ? agenda.isWeekend : false;
    const subjects = (agenda && Array.isArray(agenda.subjects) && agenda.subjects.length > 0)
      ? agenda.subjects.join(', ')
      : 'PPS, SMT, BEE, PHL';

    const pillText = isWeekend
      ? '🌴 Weekend Mode · Sprint backlog & lab write-ups'
      : `🗓️ ${dayName}: ${subjects} · Room 2310`;

    return `<div class="ai-welcome">
      <div class="ai-welcome-avatar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="9" stroke="var(--ink)" fill="var(--yellow)"/>
          <path d="M12 7v5l3 3" stroke="var(--ink)" stroke-linecap="round"/>
        </svg>
      </div>
      <h3>${greeting}, ${escapeHtml(name)} 👋</h3>
      <p class="ai-welcome-subtitle">Your StudyForged tutor for ADGIPS IT Sec-E. Ask questions, send diagrams, or explore syllabus topics.</p>
      <div class="ai-welcome-pill">${escapeHtml(pillText)}</div>

      <div class="ai-suggestions-grid">
        <button class="ai-prompt-card" type="button" data-q="What should I focus on for my classes today (${dayName}: ${subjects}) according to our syllabus and timetable?">
          <div class="ai-prompt-card-header">
            <span class="ai-prompt-card-icon">🗓️</span>
            <span>Today's Classes & Focus</span>
          </div>
          <p class="ai-prompt-card-sub">Timetable & syllabus priorities for ${dayName}</p>
        </button>

        <button class="ai-prompt-card" type="button" data-q="Explain Thevenin's theorem and KVL/KCL step-by-step with a circuit example for BEE Unit II.">
          <div class="ai-prompt-card-header">
            <span class="ai-prompt-card-icon">⚡</span>
            <span>Solve Circuit Concept</span>
          </div>
          <p class="ai-prompt-card-sub">BEE numericals, KVL/KCL & Norton steps</p>
        </button>

        <button class="ai-prompt-card" type="button" data-q="Quiz me with 5 high-yield viva questions on C pointers and 2D arrays for PPS Lab.">
          <div class="ai-prompt-card-header">
            <span class="ai-prompt-card-icon">💻</span>
            <span>PPS Lab & Viva Quiz</span>
          </div>
          <p class="ai-prompt-card-sub">ANSI C code dry-runs, pointers & viva traps</p>
        </button>

        <button class="ai-prompt-card" type="button" data-q="Analyze my active sprint goals and Kanban taskboard, and recommend my next study priority.">
          <div class="ai-prompt-card-header">
            <span class="ai-prompt-card-icon">🎯</span>
            <span>Sprint & Task Review</span>
          </div>
          <p class="ai-prompt-card-sub">Rank next action based on current progress</p>
        </button>
      </div>
    </div>`;
  }

  // ── TTS helper (Deepgram Aura) ──
  function addTTSButton(containerEl, plainText) {
    const ttsBtn = document.createElement('button');
    ttsBtn.className = 'ai-msg-action-btn ai-tts-btn';
    ttsBtn.setAttribute('type', 'button');
    ttsBtn.setAttribute('aria-label', 'Read aloud');
    ttsBtn.title = 'Deepgram Aura Read';
    ttsBtn.innerHTML = '🔊 Read';

    let currentAudio = null;

    ttsBtn.addEventListener('click', async () => {
      if (currentAudio && !currentAudio.paused) {
        currentAudio.pause();
        currentAudio = null;
        ttsBtn.innerHTML = '🔊 Read';
        ttsBtn.classList.remove('speaking');
        return;
      }

      const dgKey = getDeepgramApiKey();
      if (!dgKey) {
        showToast('Voice Key required. Please set your Deepgram key in 🔑 AI Settings.');
        return;
      }

      ttsBtn.innerHTML = '⏳ Reading...';
      try {
        // v0.6.22: speak cleaned words — never raw markdown ("star"/"hash" artifacts).
        const spoken = toSpokenText(plainText);
        if (!spoken) {
          ttsBtn.innerHTML = '🔊 Read';
          showToast('Nothing readable in this message.');
          return;
        }
        const response = await fetch('https://api.deepgram.com/v1/speak?model=aura-hera-en', {
          method: 'POST',
          headers: {
            'Authorization': `Token ${dgKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ text: spoken })
        });
        // v0.6.20: surface API errors instead of playing an error-JSON blob into silence.
        if (!response.ok) {
          let errMsg = `Voice error ${response.status}`;
          try {
            const errText = await response.text();
            const errJson = JSON.parse(errText);
            errMsg = errJson.err_msg || errJson.error || errMsg;
          } catch (e) {}
          throw new Error(errMsg);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        if (currentAudio) currentAudio.pause();
        currentAudio = new Audio(url);
        currentAudio.onplay = () => {
          ttsBtn.innerHTML = '⏹ Stop';
          ttsBtn.classList.add('speaking');
        };
        const resetBtn = () => {
          ttsBtn.innerHTML = '🔊 Read';
          ttsBtn.classList.remove('speaking');
        };
        currentAudio.onended = () => {
          resetBtn();
          currentAudio = null;
          try { URL.revokeObjectURL(url); } catch (e) {}
        };
        // v0.6.23: play() rejects when the tap's autoplay permission expired during
        // the slow fetch (button stranded on "Reading..." in silence) or media errors.
        currentAudio.onerror = () => {
          resetBtn();
          currentAudio = null;
          showToast('Voice: audio failed to play — tap Read again.');
        };
        try {
          await currentAudio.play();
        } catch (playErr) {
          resetBtn();
          currentAudio = null;
          // Keep the audio alive for a retap: re-arm by replaying on next click.
          showToast('Voice: tap Read once more to play.');
        }
      } catch (err) {
        console.error('Deepgram TTS Error:', err);
        ttsBtn.innerHTML = '🔊 Read';
        ttsBtn.classList.remove('speaking');
        showToast(`Voice: ${err.message || 'playback failed'}`);
      }
    });
    containerEl.appendChild(ttsBtn);
  }

  // ── Bot Message Action Bar (Copy + TTS + Retry) ──
  function addBotActionButtons(botMsgEl, plainText, retryFn) {
    const actionsBar = document.createElement('div');
    actionsBar.className = 'ai-msg-actions';

    // Copy response button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'ai-msg-action-btn';
    copyBtn.setAttribute('type', 'button');
    copyBtn.setAttribute('aria-label', 'Copy response');
    copyBtn.title = 'Copy response';
    copyBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy';

    copyBtn.addEventListener('click', async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(plainText);
        } else {
          const ta = document.createElement('textarea');
          ta.value = plainText;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        copyBtn.innerHTML = '✓ Copied!';
        showToast('Response copied to clipboard');
        setTimeout(() => {
          copyBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy';
        }, 1800);
      } catch (err) {
        showToast('Could not copy');
      }
    });

    actionsBar.appendChild(copyBtn);
    addTTSButton(actionsBar, plainText);

    // Retry button
    if (typeof retryFn === 'function') {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'ai-msg-action-btn ai-retry-btn';
      retryBtn.setAttribute('type', 'button');
      retryBtn.setAttribute('aria-label', 'Retry response');
      retryBtn.title = 'Retry / Regenerate response';
      retryBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Retry';

      retryBtn.addEventListener('click', () => {
        if (isGenerating) return;
        retryFn();
      });
      actionsBar.appendChild(retryBtn);
    }

    botMsgEl.appendChild(actionsBar);
  }

  // ── Render chat messages into chatArea ──
  function renderChatMessages(messages) {
    chatArea.innerHTML = '';
    if (messages.length === 0) {
      chatArea.innerHTML = buildWelcomeHTML();
      wireSuggestionChips();
      return;
    }
    messages.forEach((m, idx) => {
      if (m.role === 'user' || m.role === 'assistant') {
        const div = document.createElement('div');
        div.className = `ai-msg ${m.role === 'user' ? 'user' : 'bot'}`;
        if (m.role === 'assistant') {
          if (m.thoughtSec) {
            const thoughtBadge = document.createElement('div');
            thoughtBadge.className = 'ai-thought-pill';
            thoughtBadge.innerHTML = `
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              <span>Thought for ${m.thoughtSec}s</span>
            `;
            div.appendChild(thoughtBadge);
          }
          const contentEl = document.createElement('div');
          contentEl.className = 'ai-bot-content';
          contentEl.innerHTML = mdToHtml(m.content);
          div.appendChild(contentEl);
          // Look backward for previous user prompt
          let prevText = '';
          let prevImg = null;
          for (let j = idx - 1; j >= 0; j--) {
            if (messages[j].role === 'user') {
              if (typeof messages[j].content === 'string') {
                prevText = messages[j].content;
              } else if (Array.isArray(messages[j].content)) {
                const t = messages[j].content.find(p => p.type === 'text');
                const im = messages[j].content.find(p => p.type === 'image_url');
                if (t) prevText = t.text;
                if (im) prevImg = im.image_url?.url;
              }
              break;
            }
          }
          const retryHandler = (prevText || prevImg) ? makeRetryHandler(div, prevText, prevImg) : null;
          addBotActionButtons(div, m.content, retryHandler);
        } else {
          if (Array.isArray(m.content)) {
            m.content.forEach(part => {
              if (part.type === 'image_url' && part.image_url?.url) {
                const img = document.createElement('img');
                img.className = 'ai-msg-image';
                img.src = part.image_url.url;
                img.alt = 'Attached study diagram';
                div.appendChild(img);
              } else if (part.type === 'text' && part.text) {
                const textSpan = document.createElement('div');
                textSpan.textContent = part.text;
                div.appendChild(textSpan);
              }
            });
          } else {
            div.textContent = m.content;
          }
        }
        chatArea.appendChild(div);
      }
    });
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  // ── Start new chat ──
  function startNewChat() {
    saveCurrentChat();
    currentChatId = 'chat_' + Date.now();
    chatHistory = [];
    if (chatInput) chatInput.value = '';
    clearAttachedImage();
    chatArea.innerHTML = buildWelcomeHTML();
    wireSuggestionChips();
    localStorage.setItem(ACTIVE_CHAT_KEY, currentChatId);
  }

  // ── Load a saved chat ──
  function loadChat(chatId) {
    saveCurrentChat();
    const chats = getAllChats();
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      currentChatId = chat.id;
      chatHistory = [...chat.messages];
      renderChatMessages(chatHistory);
      localStorage.setItem(ACTIVE_CHAT_KEY, currentChatId);
    }
  }

  // ── History sidebar ──
  function openHistory() {
    renderHistoryList();
    historySidebar.classList.add('show');
    historyOverlay.classList.add('show');
  }

  function closeHistory() {
    historySidebar.classList.remove('show');
    historyOverlay.classList.remove('show');
  }

  function renderHistoryList() {
    const chats = getAllChats();
    // Close any open dropdown first
    document.querySelectorAll('.ai-chat-dropdown.show').forEach(d => d.classList.remove('show'));

    if (chats.length === 0) {
      historyList.innerHTML = '<div class="ai-history-empty">No past conversations yet.</div>';
      return;
    }
    historyList.innerHTML = '';

    // Sort: pinned first, then by timestamp descending
    const sorted = [...chats].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.timestamp - a.timestamp;
    });

    sorted.forEach(chat => {
      const item = document.createElement('div');
      item.className = 'ai-history-item' + (chat.id === currentChatId ? ' active-chat' : '');

      const date = new Date(chat.timestamp);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' +
        date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

      const pinIcon = chat.pinned ? '📌 ' : '';

      // v32: chat titles are user-editable — build with textContent.
      const row = document.createElement("div");
      row.className = "ai-history-item-row";
      const info = document.createElement("div");
      info.className = "ai-history-item-info";
      const titleEl = document.createElement("div");
      titleEl.className = "ai-history-item-title";
      titleEl.textContent = `${pinIcon}${chat.title}`;
      const dateEl = document.createElement("div");
      dateEl.className = "ai-history-item-date";
      dateEl.textContent = dateStr;
      info.append(titleEl, dateEl);
      const dotsBtn0 = document.createElement("button");
      dotsBtn0.className = "ai-chat-dots-btn";
      dotsBtn0.type = "button";
      dotsBtn0.setAttribute("aria-label", "Options");
      dotsBtn0.textContent = "⋮";
      const dropdown0 = document.createElement("div");
      dropdown0.className = "ai-chat-dropdown";
      const renameBtn = document.createElement("button");
      renameBtn.className = "ai-chat-dropdown-item";
      renameBtn.dataset.action = "rename";
      renameBtn.textContent = "✏️ Rename";
      const pinBtn = document.createElement("button");
      pinBtn.className = "ai-chat-dropdown-item";
      pinBtn.dataset.action = "pin";
      pinBtn.textContent = chat.pinned ? "📌 Unpin" : "📌 Pin";
      const delBtn = document.createElement("button");
      delBtn.className = "ai-chat-dropdown-item ai-chat-dropdown-delete";
      delBtn.dataset.action = "delete";
      delBtn.textContent = "🗑 Delete";
      dropdown0.append(renameBtn, pinBtn, delBtn);
      row.append(info, dotsBtn0);
      item.append(row, dropdown0);

      // Load chat on click (but not if clicking the dots/dropdown)
      item.querySelector('.ai-history-item-info').addEventListener('click', () => {
        loadChat(chat.id);
        closeHistory();
      });

      // 3-dot toggle
      const dotsBtn = item.querySelector('.ai-chat-dots-btn');
      const dropdown = item.querySelector('.ai-chat-dropdown');
      dotsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close all other dropdowns
        document.querySelectorAll('.ai-chat-dropdown.show').forEach(d => {
          if (d !== dropdown) d.classList.remove('show');
        });
        dropdown.classList.toggle('show');
      });

      // Dropdown actions
      dropdown.querySelectorAll('.ai-chat-dropdown-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          dropdown.classList.remove('show');
          if (action === 'rename') renameChat(chat.id);
          else if (action === 'delete') deleteChat(chat.id);
          else if (action === 'pin') togglePinChat(chat.id);
        });
      });

      historyList.appendChild(item);
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    document.querySelectorAll('.ai-chat-dropdown.show').forEach(d => d.classList.remove('show'));
  });

  // ── Rename chat ──
  function renameChat(chatId) {
    const chats = getAllChats();
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    const newName = prompt('Rename chat:', chat.title);
    if (newName && newName.trim()) {
      chat.title = newName.trim();
      saveAllChats(chats);
      renderHistoryList();
    }
  }

  // ── Delete chat ──
  function deleteChat(chatId) {
    if (!confirm('Delete this conversation?')) return;
    let chats = getAllChats();
    chats = chats.filter(c => c.id !== chatId);
    saveAllChats(chats);
    if (chatId === currentChatId) {
      startNewChat();
    }
    renderHistoryList();
  }

  // ── Pin / Unpin chat ──
  function togglePinChat(chatId) {
    const chats = getAllChats();
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    chat.pinned = !chat.pinned;
    saveAllChats(chats);
    renderHistoryList();
  }

  function clearAllHistory() {
    if (!confirm('Delete all chat history?')) return;
    localStorage.removeItem(CHAT_STORAGE_KEY);
    startNewChat();
    closeHistory();
  }

  // ── Wire suggestion chips & prompt cards ──
  function wireSuggestionChips() {
    chatArea.querySelectorAll('.ai-prompt-card, .ai-suggestion').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = btn.dataset.q;
        if (q) {
          sendMessage(q);
        }
      });
    });
  }

  // Open AI page
  function openAI() {
    if (isGenerating) handleStopGeneration();
    saveCurrentChat();

    // Always start with a fresh, clean chatbox session curated for our app
    startNewChat();

    aiPage.classList.add('open');
    if (bottomNav) bottomNav.style.display = 'none';
    if (chatInput) {
      chatInput.value = '';
      setTimeout(() => chatInput.focus(), 250);
    }
  }

  // Close AI page
  function closeAI() {
    if (isGenerating) handleStopGeneration();
    saveCurrentChat();
    // Ensure any unanswered orphan in memory is cleanly reset
    const hasAssistant = chatHistory.some(isValidAssistantMsg);
    if (!hasAssistant) {
      startNewChat();
    }
    aiPage.classList.remove('open');
    if (bottomNav) bottomNav.style.display = 'flex';
  }

  // Active thinking timer controller
  let activeThinkingStopper = null;

  // Show thinking animation indicator in chat
  function showThinkingAnimation(hasImage = false) {
    const thinkingStartTime = Date.now();
    const thinkingStatuses = hasImage ? [
      'Analyzing attached study diagram...',
      'Extracting formulas & circuit diagrams...',
      'Grounding in syllabus & exam blueprint...',
      'Synthesizing step-by-step solution...'
    ] : [
      'Connecting to syllabus & timetable...',
      'Reviewing core concepts & formulas...',
      'Synthesizing step-by-step explanation...',
      'Structuring key exam takeaways...'
    ];
    let thinkingStatusIdx = 0;

    const card = document.createElement('div');
    card.className = 'ai-msg bot ai-thinking-card';
    card.innerHTML = `
      <div class="ai-thinking-header">
        <div class="ai-thinking-glow">
          <svg class="ai-thinking-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
        </div>
        <div class="ai-thinking-title-wrap">
          <span class="ai-thinking-title">Thinking</span>
          <span class="ai-thinking-dots">
            <span></span><span></span><span></span>
          </span>
        </div>
        <span class="ai-thinking-timer-pill">1s</span>
      </div>
      <div class="ai-thinking-shimmer"></div>
      <div class="ai-thinking-status">${thinkingStatuses[0]}</div>
    `;
    chatArea.appendChild(card);
    chatArea.scrollTop = chatArea.scrollHeight;

    const timerPill = card.querySelector('.ai-thinking-timer-pill');
    const statusEl = card.querySelector('.ai-thinking-status');

    const intervalId = setInterval(() => {
      const elapsed = Math.max(1, Math.round((Date.now() - thinkingStartTime) / 1000));
      if (timerPill) timerPill.textContent = `${elapsed}s`;
      if (statusEl) {
        if (elapsed >= 10) {
          statusEl.textContent = `Synthesizing response (${elapsed}s)...`;
        } else if (elapsed % 2 === 0) {
          thinkingStatusIdx = (thinkingStatusIdx + 1) % thinkingStatuses.length;
          statusEl.textContent = thinkingStatuses[thinkingStatusIdx];
        }
      }
    }, 1000);

    const stopFn = () => {
      clearInterval(intervalId);
      const elapsed = Math.max(1, Math.round((Date.now() - thinkingStartTime) / 1000));
      if (card.parentNode) card.remove();
      return elapsed;
    };

    activeThinkingStopper = stopFn;

    return {
      element: card,
      stop: () => {
        if (activeThinkingStopper === stopFn) activeThinkingStopper = null;
        return stopFn();
      }
    };
  }

  // Fallback wrapper for typing indicator
  function showTyping(hasImage = false) {
    return showThinkingAnimation(hasImage);
  }

  // Build lean user context from app state (high speed, sub-2s latency)
  function getUserContext() {
    const s = state;
    const now = new Date();
    const parts = [];

    // Today's schedule only (saves thousands of tokens)
    try {
      const agenda = typeof getTodayAgenda === "function" ? getTodayAgenda(s, now) : null;
      if (agenda) {
        if (agenda.isWeekend) {
          parts.push(`Today is weekend (${agenda.day}). No lectures scheduled.`);
        } else {
          const slots = (typeof SF_TIMETABLE !== "undefined" && SF_TIMETABLE[agenda.day]) ? SF_TIMETABLE[agenda.day] : [];
          const slotTimes = typeof SF_TT_SLOTS !== "undefined" ? SF_TT_SLOTS : [];
          const sched = slots.map((cell, idx) => {
            const time = slotTimes[idx] || `Slot ${idx+1}`;
            return `${time}: ${cell}`;
          }).join(' | ');
          parts.push(`Today's Classes (${agenda.day}): ${sched}`);
        }
      }
    } catch (e) {}

    // Top active goals
    if (s.goals && s.goals.length > 0) {
      const topGoals = s.goals.slice(0, 2).map(g => `"${g.title}" (${g.progress}%)`).join(', ');
      parts.push(`Active Goals: ${topGoals}`);
    }

    // Top active tasks
    const activeTasks = (s.tasks || []).filter(t => t.status === 'progress' || t.status === 'plan').slice(0, 3);
    if (activeTasks.length) {
      parts.push(`Active Tasks: ${activeTasks.map(t => `"${t.title}"`).join(', ')}`);
    }

    return parts.join('\n');
  }

// Call Vercel AI Gateway API (Default: meta/muse-ember)
  async function callAI(userText, imageBase64, signal, isRetry = false, onChunk = null) {
    let userMsgContent;
    if (imageBase64) {
      userMsgContent = [];
      if (userText && userText.trim()) {
        userMsgContent.push({ type: 'text', text: userText.trim() });
      } else {
        userMsgContent.push({ type: 'text', text: 'Analyze this study diagram/image in detail and explain the key concepts, formulas, or solutions.' });
      }
      userMsgContent.push({
        type: 'image_url',
        image_url: { url: imageBase64 }
      });
    } else {
      userMsgContent = userText;
    }

    if (!isRetry) {
      chatHistory.push({ role: 'user', content: userMsgContent });
    }
    const userContext = getUserContext();
    const subjectContext = trimmedBuddyBlock(typeof userText === 'string' ? userText : '');

    let systemPrompt = `${AI_SYSTEM_PROMPT}${subjectContext ? `\n\n${subjectContext}` : ''}${userContext ? `\n\nStudent Live Context:\n${userContext}` : ''}`;
    if (window.activeCheatsheetState) {
      const s = window.activeCheatsheetState;
      systemPrompt += `\n\n[ACTIVE CHEATSHEET ITERATION CONTEXT]\n` +
        `The student currently has an active cheatsheet open in the pop-up viewer:\n` +
        `- Title: ${s.title}\n` +
        `- Subject: ${s.alias}\n` +
        `- Subtitle: ${s.subtitle}\n` +
        (s.doc && Array.isArray(s.doc.boxes) ? `- Current Cards (${s.doc.boxes.length}): ${s.doc.boxes.map((b, i) => `Card ${i+1}: ${b.title}`).join(', ')}\n` : '') +
        `When the student asks to modify, update, shorten, add formulas, or rephrase cards on this cheatsheet, maintain technical accuracy and dense syllabus coverage. Respond with a concise explanation AND an updated JSON block containing {"title": "${s.title}", "boxes": [...]}. The app will automatically detect this JSON and refresh the student's pop-up viewer live!`;
    }
    // Sufficient token budget to accommodate reasoning tokens (reasoning_details) and full response
    const maxTokens = 3500;

    // Balanced chat history: preserves full formulas, derivations, code, and details for recent turns
    // v0.6.7 snappy: last 5 turns + 1200-char cap (was 6/1500) — lighter prompt, faster TTFT in long chats.
    const recentHistory = chatHistory.slice(-5).map(msg => {
      if (msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.includes('[ACTIVE CHEATSHEET')) {
        return msg;
      }
      if (msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.length > 1200) {
        return {
          role: 'assistant',
          content: msg.content.slice(0, 1200) + '... [remaining section truncated]'
        };
      }
      return msg;
    });

    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentHistory
    ];

    const model = getActiveAiModel();
    const activeApiUrl = getActiveAiApiUrl();

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
    };

    let res;
    const reqPayload = JSON.stringify({
      model: model,
      messages,
      temperature: 0.6,
      max_tokens: maxTokens,
      stream: true,
      reasoning_effort: 'low'
    });

    try {
      try {
        res = await fetch(activeApiUrl, {
          method: 'POST',
          headers: headers,
          body: reqPayload,
          signal: signal
        });
      } catch (firstErr) {
        if (firstErr.name === 'AbortError') throw firstErr;
        const fallbackUrl = getActiveAiApiFallbackUrl();
        res = await fetch(fallbackUrl, {
          method: 'POST',
          headers: headers,
          body: reqPayload,
          signal: signal
        });
      }
      if (!res || !res.ok) {
        const errData = await res.json().catch(() => ({}));
        let rawMsg = errData.error?.message || `API error ${res.status}`;
        throw new Error(rawMsg || 'AI connection issue — please try again');
      }

      let reply = '';
      if (res.body && typeof res.body.getReader === 'function') {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulated = '';
        let isFirst = true;

        while (true) {
          if (signal && signal.aborted) {
            try { reader.cancel(); } catch (e) {}
            break;
          }
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]' || trimmed.startsWith(':')) continue;
            if (trimmed.startsWith('data: ')) {
              try {
                const json = JSON.parse(trimmed.slice(6));
                const delta = json.choices?.[0]?.delta;
                if (!delta) continue;
                const content = delta.content || delta.text || '';
                if (content) {
                  accumulated += content;
                  if (typeof onChunk === 'function') {
                    onChunk({ delta: content, text: accumulated, isFirst });
                  }
                  isFirst = false;
                }
              } catch (e) {}
            }
          }
        }
        reply = accumulated;
      } else {
        const data = await res.json();
        if (data.error) {
          let rawMsg = data.error.message || `API error (${data.error.code || 'unknown'})`;
          let userMsg = rawMsg;
          if (data.error.code === 503 || (typeof rawMsg === 'string' && rawMsg.toLowerCase().includes('temporarily unavailable'))) {
            userMsg = `${rawMsg} Upstream provider may be busy; try switching models in 🔑 settings.`;
          }
          throw new Error(userMsg);
        }
        reply = (data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || data.choices?.[0]?.message?.reasoning || '').trim();
        if (typeof onChunk === 'function') {
          onChunk({ delta: reply, text: reply, isFirst: true });
        }
      }

      const finalReply = reply.trim() || "Sorry, I couldn't generate a response.";
      chatHistory.push({ role: 'assistant', content: finalReply });
      return finalReply;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw err;
      }
      console.error('Vercel AI Gateway API Error:', err);
      if (err && isModelMissingError(err.message)) healDeadModel();
      // Remove unanswered user prompt from chatHistory so context stays clean
      if (!isRetry && chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'user') {
        chatHistory.pop();
      }
      return `⚠️ Error: ${err.message}`;
    }
  }

  // ── Stop generation helpers ──
  let abortController = null;
  let isGenerating = false;
  let stopTyping = false;

  const sendBtnDefaultHTML = sendBtn.innerHTML;

  function showStopBtn() {
    isGenerating = true;
    sendBtn.disabled = false;
    sendBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" fill="white"/></svg>';
    sendBtn.classList.add('stop-mode');
  }

  function showSendBtn() {
    isGenerating = false;
    stopTyping = false;
    sendBtn.innerHTML = sendBtnDefaultHTML;
    sendBtn.classList.remove('stop-mode');
    sendBtn.disabled = false;
  }

  function handleStopGeneration() {
    if (activeThinkingStopper) {
      activeThinkingStopper();
      activeThinkingStopper = null;
    }
    if (abortController) { abortController.abort(); abortController = null; }
    stopTyping = true;
  }

  // ── Retry / Regenerate handler ──
  function makeRetryHandler(botMsgEl, userText, userImage) {
    return async function() {
      if (isGenerating) return;

      // Find the matching user message in chatHistory
      let userIdx = -1;
      for (let j = chatHistory.length - 1; j >= 0; j--) {
        if (chatHistory[j].role === 'user') {
          const c = chatHistory[j].content;
          const txt = typeof c === 'string' ? c : (Array.isArray(c) ? c.find(p => p.type === 'text')?.text : '');
          if (txt === userText || (!txt && !userText)) {
            userIdx = j;
            break;
          }
        }
      }
      if (userIdx >= 0) {
        chatHistory = chatHistory.slice(0, userIdx + 1);
      } else if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'assistant') {
        chatHistory.pop();
      }

      // Show thinking animation inside existing bot bubble
      const thinkingStartTime = Date.now();
      const thinkingStatuses = userImage ? [
        'Re-analyzing study diagram...',
        'Extracting formulas & circuit diagrams...',
        'Synthesizing improved solution...'
      ] : [
        'Re-connecting to course concepts...',
        'Refining syllabus context & notes...',
        'Formulating clearer step-by-step answer...'
      ];
      let thinkingStatusIdx = 0;

      botMsgEl.className = 'ai-msg bot';
      botMsgEl.innerHTML = `
        <div class="ai-thinking-card" style="margin: 0;">
          <div class="ai-thinking-header">
            <div class="ai-thinking-glow">
              <svg class="ai-thinking-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
            </div>
            <div class="ai-thinking-title-wrap">
              <span class="ai-thinking-title">Thinking</span>
              <span class="ai-thinking-dots">
                <span></span><span></span><span></span>
              </span>
            </div>
            <span class="ai-thinking-timer-pill">1s</span>
          </div>
          <div class="ai-thinking-shimmer"></div>
          <div class="ai-thinking-status">${thinkingStatuses[0]}</div>
        </div>
      `;
      showStopBtn();
      chatArea.scrollTop = chatArea.scrollHeight;

      const timerPill = botMsgEl.querySelector('.ai-thinking-timer-pill');
      const statusEl = botMsgEl.querySelector('.ai-thinking-status');
      const intervalId = setInterval(() => {
        const elapsed = Math.max(1, Math.round((Date.now() - thinkingStartTime) / 1000));
        if (timerPill) timerPill.textContent = `${elapsed}s`;
        if (statusEl) {
          if (elapsed >= 10) {
            statusEl.textContent = `Synthesizing response (${elapsed}s)...`;
          } else if (elapsed % 2 === 0) {
            thinkingStatusIdx = (thinkingStatusIdx + 1) % thinkingStatuses.length;
            statusEl.textContent = thinkingStatuses[thinkingStatusIdx];
          }
        }
      }, 1000);

      activeThinkingStopper = () => {
        clearInterval(intervalId);
      };

      let contentEl = null;
      let totalThoughtSec = 1;
      let latestAccumulated = '';
      let frameScheduled = false;

      function renderStream() {
        if (contentEl) {
          // v0.6.7 snappy: fast markdown during stream (no KaTeX), full math on final render.
          contentEl.innerHTML = mdToHtml(latestAccumulated, true) + '<span class="ai-block-cursor"></span>';
          // Only autoscroll when user is already near bottom — avoids yanking while reading + layout thrash.
          try {
            const nearBottom = (chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight) < 140;
            if (nearBottom) chatArea.scrollTop = chatArea.scrollHeight;
          } catch (e) {}
        }
        frameScheduled = false;
      }

      abortController = new AbortController();
      let reply = '';
      try {
        reply = await callAI(
          userText,
          userImage,
          abortController.signal,
          true,
          ({ delta, text: accumulated, isFirst }) => {
            latestAccumulated = accumulated;
            if (isFirst) {
              clearInterval(intervalId);
              activeThinkingStopper = null;
              totalThoughtSec = Math.max(1, Math.round((Date.now() - thinkingStartTime) / 1000));
              botMsgEl.innerHTML = '';

              const thoughtBadge = document.createElement('div');
              thoughtBadge.className = 'ai-thought-pill';
              thoughtBadge.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                </svg>
                <span>Thought for ${totalThoughtSec}s</span>
              `;
              botMsgEl.appendChild(thoughtBadge);

              contentEl = document.createElement('div');
              contentEl.className = 'ai-bot-content';
              botMsgEl.appendChild(contentEl);
            }

            if (!frameScheduled) {
              frameScheduled = true;
              setTimeout(renderStream, 35);
            }
          }
        );
      } catch (e) {
        if (e.name === 'AbortError') {
          reply = latestAccumulated || '⏹ Generation stopped.';
        } else {
          reply = `⚠️ Error: ${e.message}`;
        }
      }

      clearInterval(intervalId);
      activeThinkingStopper = null;
      abortController = null;

      if (!contentEl) {
        botMsgEl.innerHTML = '';
        contentEl = document.createElement('div');
        contentEl.className = 'ai-bot-content';
        botMsgEl.appendChild(contentEl);
      }

      const finalText = (latestAccumulated || reply || '').trim();
      contentEl.innerHTML = mdToHtml(finalText);
      addBotActionButtons(botMsgEl, finalText, makeRetryHandler(botMsgEl, userText, userImage));
      chatArea.scrollTop = chatArea.scrollHeight;

      if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'assistant') {
        chatHistory[chatHistory.length - 1].thoughtSec = totalThoughtSec;
        chatHistory[chatHistory.length - 1].content = finalText;
      }

      showSendBtn();
      saveCurrentChat();
    };
  }

  // Send a message (Text + Optional Multimodal Image)
  async function sendMessage(text) {
    const hasText = !!(text && text.trim());
    const hasImage = !!attachedImageBase64;
    if (!hasText && !hasImage) return;

    const imageToSend = attachedImageBase64;
    clearAttachedImage();

    // Remove welcome if present
    const welcome = chatArea.querySelector('.ai-welcome');
    if (welcome) welcome.remove();

    // User bubble
    const userMsg = document.createElement('div');
    userMsg.className = 'ai-msg user';
    if (imageToSend) {
      const imgEl = document.createElement('img');
      imgEl.className = 'ai-msg-image';
      imgEl.src = imageToSend;
      imgEl.alt = 'Uploaded study diagram';
      userMsg.appendChild(imgEl);
    }
    if (hasText) {
      const textEl = document.createElement('div');
      textEl.textContent = text.trim();
      userMsg.appendChild(textEl);
    }
    chatArea.appendChild(userMsg);

    if (chatInput) chatInput.value = '';
    showStopBtn();
    chatArea.scrollTop = chatArea.scrollHeight;

    const thinker = showThinkingAnimation(!!imageToSend);

    let botMsg = null;
    let contentEl = null;
    let thoughtBadge = null;
    let totalThoughtSec = 1;
    let latestAccumulated = '';
    let frameScheduled = false;

    function renderStream() {
      if (contentEl) {
        // v0.6.7 snappy: fast markdown during stream (no KaTeX), full math on final render.
        contentEl.innerHTML = mdToHtml(latestAccumulated, true) + '<span class="ai-block-cursor"></span>';
        try {
          const nearBottom = (chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight) < 140;
          if (nearBottom) chatArea.scrollTop = chatArea.scrollHeight;
        } catch (e) {}
      }
      frameScheduled = false;
    }

    abortController = new AbortController();
    let reply = '';

    try {
      reply = await callAI(
        hasText ? text.trim() : '',
        imageToSend,
        abortController.signal,
        false,
        ({ delta, text: accumulated, isFirst }) => {
          latestAccumulated = accumulated;
          if (isFirst) {
            totalThoughtSec = thinker.stop();

            botMsg = document.createElement('div');
            botMsg.className = 'ai-msg bot';
            chatArea.appendChild(botMsg);

            thoughtBadge = document.createElement('div');
            thoughtBadge.className = 'ai-thought-pill';
            thoughtBadge.innerHTML = `
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              <span>Thought for ${totalThoughtSec}s</span>
            `;
            botMsg.appendChild(thoughtBadge);

            contentEl = document.createElement('div');
            contentEl.className = 'ai-bot-content';
            botMsg.appendChild(contentEl);
          }

          if (!frameScheduled) {
            frameScheduled = true;
            setTimeout(renderStream, 35);
          }
        }
      );
    } catch (e) {
      if (e.name === 'AbortError') {
        reply = latestAccumulated || '⏹ Generation stopped.';
      } else {
        reply = `⚠️ Error: ${e.message}`;
      }
      if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'user') {
        chatHistory.pop();
      }
    }

    // If stream never delivered a first token before stopping or erroring
    if (!botMsg) {
      totalThoughtSec = thinker.stop();
      botMsg = document.createElement('div');
      botMsg.className = 'ai-msg bot';
      chatArea.appendChild(botMsg);

      contentEl = document.createElement('div');
      contentEl.className = 'ai-bot-content';
      botMsg.appendChild(contentEl);
    }

    abortController = null;
    const finalText = (latestAccumulated || reply || '').trim();

    // Final render without cursor
    contentEl.innerHTML = mdToHtml(finalText);
    addBotActionButtons(botMsg, finalText, makeRetryHandler(botMsg, hasText ? text.trim() : '', imageToSend));
    chatArea.scrollTop = chatArea.scrollHeight;

    // Check if the reply contains an updated cheatsheet JSON (conversational iteration)
    if (window.activeCheatsheetState && typeof sheetParseDoc === 'function' && typeof updateActiveCheatsheet === 'function') {
      try {
        const parsedDoc = sheetParseDoc(finalText);
        if (parsedDoc && Array.isArray(parsedDoc.boxes) && parsedDoc.boxes.length >= 3) {
          updateActiveCheatsheet(parsedDoc, botMsg);
        }
      } catch (err) {
        console.warn('Cheatsheet update parse check:', err);
      }
    }

    if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'assistant') {
      chatHistory[chatHistory.length - 1].thoughtSec = totalThoughtSec;
      chatHistory[chatHistory.length - 1].content = finalText;
    }

    showSendBtn();
    saveCurrentChat();
  }

  // ── Wire all events ──
  searchBar.addEventListener('click', openAI);
  backBtn.addEventListener('click', closeAI);
  sendBtn.addEventListener('click', () => {
    if (isGenerating) { handleStopGeneration(); }
    else { sendMessage(chatInput.value); }
  });
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(chatInput.value);
    }
  });
  wireSuggestionChips();

  // History events
  historyBtn.addEventListener('click', openHistory);
  historyClose.addEventListener('click', closeHistory);
  historyOverlay.addEventListener('click', closeHistory);
  historyClear.addEventListener('click', clearAllHistory);
  newChatBtn.addEventListener('click', () => {
    startNewChat();
    closeHistory();
    showToast('New chat started ✨');
  });

  // ── Fresh Chatbot Session by Default (Gemini/ChatGPT standard) ──
  // Input hygiene: ensure input field and vision preview are 100% clean
  if (chatInput) chatInput.value = '';
  clearAttachedImage();

  // Purge any old empty / 1-message orphan chats from history
  try {
    getAllChats(); // Self-purges orphan chats and syncs to localStorage
  } catch (e) {}

  // Always start with a clean, dynamic canvas on load
  startNewChat();

  // ── 1-Page Unit Cheatsheet mode (Ask AI section, no nav change) ──
  const modeChatBtn = document.getElementById('aiModeChatBtn');
  const modeSheetBtn = document.getElementById('aiModeSheetBtn');
  const sheetBar = document.getElementById('aiSheetBar');
  const sheetSubject = document.getElementById('aiSheetSubject');
  const sheetUnit = document.getElementById('aiSheetUnit');
  const sheetGenBtn = document.getElementById('aiSheetGenBtn');
  const sheetStatus = document.getElementById('aiSheetStatus');
  const chatInputBar = aiPage.querySelector('.ai-input-bar');
  let sheetBusy = false;
  let sheetAbort = null;
  let sheetForgeTimer = null;
  const stopSheetForge = () => {
    if (sheetForgeTimer) { clearInterval(sheetForgeTimer); sheetForgeTimer = null; }
  };

  function sheetSubjects() {
    if (typeof SF_SEM1_SUBJECTS !== 'undefined' && Array.isArray(SF_SEM1_SUBJECTS) && SF_SEM1_SUBJECTS.length) {
      return SF_SEM1_SUBJECTS;
    }
    return [];
  }
  function fillSheetSubjects() {
    if (!sheetSubject) return;
    sheetSubject.innerHTML = '';
    sheetSubjects().forEach((s) => {
      const o = document.createElement('option');
      o.value = s.alias;
      o.textContent = `${s.alias} — ${s.name}`;
      sheetSubject.appendChild(o);
    });
    fillSheetUnits();
  }
  // Verified Master Cheatsheets from cheatsheet-layout skill (pre-leveled, high-density print assets)
  const MASTER_CHEATSHEETS = {
    'pps-u1': {
      subject: 'PPS',
      title: 'Programming for Problem Solving (ICT-101) · Unit 1',
      subtitle: 'ANSI C, Data Types, Precedence, Control Flow, Branching & Loops',
      pdf: './cheatsheets/pps/work/csl_u1.pdf',
      faculty: 'Ms. Alka · ADGIPS IT Sem-1',
      badge: '🌟 22 DENSE TOPIC CARDS · VERIFIED A4 LANDSCAPE'
    },
    'pps-u2': {
      subject: 'PPS',
      title: 'Programming for Problem Solving (ICT-101) · Unit 2',
      subtitle: 'Arrays, 1D/2D, Functions, Strings, Recursion, Sorting & Searching',
      pdf: './cheatsheets/pps/work/csl_u2.pdf',
      faculty: 'Ms. Alka · ADGIPS IT Sem-1',
      badge: '🌟 20 DENSE TOPIC CARDS · VERIFIED A4 LANDSCAPE'
    },
    'pps-u1-u2': {
      subject: 'PPS',
      title: 'Programming for Problem Solving (ICT-101) · Units 1 & 2',
      subtitle: 'ANSI C, Types, Precedence, Control Flow, Arrays, Functions, Sort/Search',
      pdf: './cheatsheets/pps/pps-cheatsheet.pdf',
      page1: './cheatsheets/pps/page1.png',
      page2: './cheatsheets/pps/page2.png',
      faculty: 'Ms. Alka · ADGIPS IT Sem-1',
      badge: '🌟 42 DENSE TOPIC CARDS · VERIFIED DUPLEX A4 LANDSCAPE'
    },
    'em-u1': {
      subject: 'EM',
      title: 'Engineering Mechanics (ICT-119) · Unit 1',
      subtitle: 'Force Systems, Varignon, Couples, FBDs, 2D/3D Equilibrium & Lami Theorem',
      pdf: './cheatsheets/em/work/csl_u1.pdf',
      faculty: 'Dr. Bajpai · ADGIPS IT Sem-1',
      badge: '🌟 22 DENSE TOPIC CARDS · VERIFIED A4 LANDSCAPE'
    },
    'em-u2': {
      subject: 'EM',
      title: 'Engineering Mechanics (ICT-119) · Unit 2',
      subtitle: 'Trusses, Method of Joints/Sections, Beams, SFD/BMD & Cables',
      pdf: './cheatsheets/em/work/csl_u2.pdf',
      faculty: 'Dr. Bajpai · ADGIPS IT Sem-1',
      badge: '🌟 20 DENSE TOPIC CARDS · VERIFIED A4 LANDSCAPE'
    },
    'em-u1-u2': {
      subject: 'EM',
      title: 'Engineering Mechanics (ICT-119) · Units 1 & 2',
      subtitle: 'Force Systems, Varignon, Couples, FBDs, Trusses, Beams & Cables',
      pdf: './cheatsheets/em/em-cheatsheet.pdf',
      page1: './cheatsheets/em/page1.png',
      page2: './cheatsheets/em/page2.png',
      faculty: 'Dr. Bajpai · ADGIPS IT Sem-1',
      badge: '🌟 42 DENSE TOPIC CARDS · VERIFIED DUPLEX A4 LANDSCAPE'
    },
    'em-u3': {
      subject: 'EM',
      title: 'Engineering Mechanics (ICT-119) · Unit 3',
      subtitle: 'Centroids, Pappus-Guldinus, Area & Mass MOI, Parallel Axis Theorem',
      pdf: './cheatsheets/em34/work/csl_u1.pdf',
      faculty: 'Dr. Bajpai · ADGIPS IT Sem-1',
      badge: '🌟 22 DENSE TOPIC CARDS · VERIFIED A4 LANDSCAPE'
    },
    'em-u4': {
      subject: 'EM',
      title: 'Engineering Mechanics (ICT-119) · Unit 4',
      subtitle: 'Friction, Belt Friction, Wedges, Kinematics & Virtual Work',
      pdf: './cheatsheets/em34/work/csl_u2.pdf',
      faculty: 'Dr. Bajpai · ADGIPS IT Sem-1',
      badge: '🌟 20 DENSE TOPIC CARDS · VERIFIED A4 LANDSCAPE'
    },
    'em-u3-u4': {
      subject: 'EM',
      title: 'Engineering Mechanics (ICT-119) · Units 3 & 4',
      subtitle: 'Centroids, Pappus-Guldinus, MOI, Friction, Kinematics, Virtual Work',
      pdf: './cheatsheets/em34/em34-cheatsheet.pdf',
      page1: './cheatsheets/em34/page1.png',
      page2: './cheatsheets/em34/page2.png',
      faculty: 'Dr. Bajpai · ADGIPS IT Sem-1',
      badge: '🌟 42 DENSE TOPIC CARDS · VERIFIED DUPLEX A4 LANDSCAPE'
    },
    'phy-u1': {
      subject: 'PHL',
      title: 'Engineering Physics–I (ICT-111T) · Unit 1',
      subtitle: 'Coordinates, Vectors, Newton Laws, Frames of Reference, Constrained Motion',
      pdf: './cheatsheets/phy/work/csl_u1.pdf',
      faculty: 'Dr. M. Gupta · ADGIPS IT Sem-1',
      badge: '🌟 23 DENSE TOPIC CARDS · VERIFIED A4 LANDSCAPE'
    },
    'phy-u2': {
      subject: 'PHL',
      title: 'Engineering Physics–I (ICT-111T) · Unit 2',
      subtitle: 'Work-Energy, Momentum, Central Forces, Kepler Laws, Orbits & Collisions',
      pdf: './cheatsheets/phy/work/csl_u2.pdf',
      faculty: 'Dr. M. Gupta · ADGIPS IT Sem-1',
      badge: '🌟 23 DENSE TOPIC CARDS · VERIFIED A4 LANDSCAPE'
    },
    'phy-u1-u2': {
      subject: 'PHL',
      title: 'Engineering Physics–I (ICT-111T) · Units 1 & 2',
      subtitle: 'Coordinates, Newtonian Motion, Work-Energy, Momentum & Central Forces',
      pdf: './cheatsheets/phy/phy-cheatsheet.pdf',
      page1: './cheatsheets/phy/page1.png',
      page2: './cheatsheets/phy/page2.png',
      faculty: 'Dr. M. Gupta · ADGIPS IT Sem-1',
      badge: '🌟 46 DENSE TOPIC CARDS · VERIFIED DUPLEX A4 LANDSCAPE'
    }
  };


  // Full-bleed modal viewer with multi-level zoom (100% - 350%)
  function openImageFullscreen(imgSrc, title, pdfUrl) {
    const existing = document.getElementById('masterModal');
    if (existing) existing.remove();

    let zoom = 1.0;
    const modal = document.createElement('div');
    modal.id = 'masterModal';
    modal.className = 'master-img-modal';

    const bar = document.createElement('div');
    bar.className = 'master-modal-bar';

    const titleEl = document.createElement('div');
    titleEl.className = 'master-modal-title';
    titleEl.innerHTML = '<span>🔍</span> <span>' + escapeHtml(title || 'Master Cheatsheet View') + '</span>';

    const tools = document.createElement('div');
    tools.className = 'master-modal-tools';

    const zoomLabel = document.createElement('span');
    zoomLabel.style.cssText = 'font-size:12px; font-weight:700; color:#cbd5e1; min-width:48px; text-align:center;';
    zoomLabel.textContent = '100%';

    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.type = 'button';
    zoomOutBtn.className = 'master-modal-btn';
    zoomOutBtn.textContent = '➖ Zoom Out';

    const zoomInBtn = document.createElement('button');
    zoomInBtn.type = 'button';
    zoomInBtn.className = 'master-modal-btn';
    zoomInBtn.textContent = '➕ Zoom In';

    const zoomFitBtn = document.createElement('button');
    zoomFitBtn.type = 'button';
    zoomFitBtn.className = 'master-modal-btn';
    zoomFitBtn.textContent = '🔄 Fit';

    const zoom200Btn = document.createElement('button');
    zoom200Btn.type = 'button';
    zoom200Btn.className = 'master-modal-btn';
    zoom200Btn.textContent = '🔍 200% Detail';

    let dlBtn = null;
    if (pdfUrl) {
      dlBtn = document.createElement('a');
      dlBtn.className = 'master-modal-btn primary';
      dlBtn.href = pdfUrl;
      dlBtn.download = pdfUrl.split('/').pop();
      dlBtn.target = '_blank';
      dlBtn.innerHTML = '📥 Download PDF';
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'master-modal-btn';
    closeBtn.textContent = '✕ Close';

    tools.append(zoomOutBtn, zoomLabel, zoomInBtn, zoomFitBtn, zoom200Btn);
    if (dlBtn) tools.appendChild(dlBtn);
    tools.appendChild(closeBtn);

    bar.append(titleEl, tools);
    modal.appendChild(bar);

    const body = document.createElement('div');
    body.className = 'master-modal-body';

    const img = document.createElement('img');
    img.className = 'master-modal-img';
    img.src = imgSrc;
    img.alt = title || 'Cheatsheet';

    body.appendChild(img);
    modal.appendChild(body);
    document.body.appendChild(modal);

    function applyZoom(z) {
      zoom = Math.max(0.5, Math.min(3.5, z));
      img.style.transform = 'scale(' + zoom + ')';
      zoomLabel.textContent = Math.round(zoom * 100) + '%';
      if (zoom > 1.0) {
        body.style.alignItems = 'flex-start';
        body.style.justifyContent = 'flex-start';
      } else {
        body.style.alignItems = 'flex-start';
        body.style.justifyContent = 'center';
      }
    }

    zoomInBtn.addEventListener('click', (e) => { e.stopPropagation(); applyZoom(zoom + 0.35); });
    zoomOutBtn.addEventListener('click', (e) => { e.stopPropagation(); applyZoom(zoom - 0.35); });
    zoomFitBtn.addEventListener('click', (e) => { e.stopPropagation(); applyZoom(1.0); });
    zoom200Btn.addEventListener('click', (e) => { e.stopPropagation(); applyZoom(2.0); });

    img.addEventListener('click', (e) => {
      e.stopPropagation();
      if (zoom <= 1.1) applyZoom(2.0);
      else applyZoom(1.0);
    });

    function closeModal() {
      modal.remove();
      window.removeEventListener('keydown', onKeyDown);
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') closeModal();
      else if (e.key === '+' || e.key === '=') applyZoom(zoom + 0.35);
      else if (e.key === '-' || e.key === '_') applyZoom(zoom - 0.35);
      else if (e.key === '0') applyZoom(1.0);
    }

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target === body) closeModal();
    });
    window.addEventListener('keydown', onKeyDown);
  }

  // Builder for Verified Master Cheatsheets (exact high-density skill assets)
  function buildMasterCheatsheetDOM(masterKey) {
    const normKey = masterKey.replace(/^master-/, '');
    const data = MASTER_CHEATSHEETS[normKey] || MASTER_CHEATSHEETS[masterKey];
    if (!data) return null;

    const root = document.createElement('div');
    root.className = 'master-cheatsheet-wrap';

    // Header
    const header = document.createElement('div');
    header.className = 'master-sheet-header';

    const badgeRow = document.createElement('div');
    badgeRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;';

    const badge = document.createElement('span');
    badge.className = 'master-sheet-badge';
    badge.textContent = '🌟 VERIFIED MASTER DUPLEX CHEATSHEET · 200+ DPI PRINT READY';

    const actions = document.createElement('div');
    actions.className = 'duplex-actions';
    actions.style.marginTop = '0';

    const dlPdfBtn = document.createElement('a');
    dlPdfBtn.className = 'btn-sheet-act btn-sheet-pdf';
    dlPdfBtn.href = data.pdf;
    dlPdfBtn.download = data.pdf.split('/').pop();
    dlPdfBtn.target = '_blank';
    dlPdfBtn.innerHTML = '📥 Download Master PDF (Print-Ready)';

    const printBtn = document.createElement('button');
    printBtn.type = 'button';
    printBtn.className = 'btn-sheet-act';
    printBtn.innerHTML = '🖨️ Print';
    printBtn.addEventListener('click', () => {
      const win = window.open(data.pdf, '_blank');
      if (win) win.focus();
    });

    actions.append(dlPdfBtn, printBtn);
    badgeRow.append(badge, actions);

    const title = document.createElement('div');
    title.className = 'master-sheet-title';
    title.textContent = data.title;

    const sub = document.createElement('div');
    sub.className = 'master-sheet-sub';
    sub.innerHTML = '<span>Coverage:</span> ' + escapeHtml(data.subtitle) + ' · <span>Faculty / Exam:</span> ' + escapeHtml(data.faculty);

    header.append(badgeRow, title, sub);
    root.appendChild(header);

    // Tabs
    const tabs = document.createElement('div');
    tabs.className = 'duplex-tabs';

    const tab1 = document.createElement('button');
    tab1.type = 'button';
    tab1.className = 'duplex-tab active';
    tab1.textContent = '📄 Page 1: Front (High Res)';

    const tab2 = document.createElement('button');
    tab2.type = 'button';
    tab2.className = 'duplex-tab';
    tab2.textContent = '📄 Page 2: Back (High Res)';

    const tabBoth = document.createElement('button');
    tabBoth.type = 'button';
    tabBoth.className = 'duplex-tab';
    tabBoth.textContent = '📑 Both Pages (Duplex View)';

    tabs.append(tab1, tab2, tabBoth);
    root.appendChild(tabs);

    // Container
    const container = document.createElement('div');
    container.className = 'master-pages-container';

    // Page 1 Box
    const p1Wrap = document.createElement('div');
    p1Wrap.className = 'master-page-box';
    const p1Label = document.createElement('div');
    p1Label.className = 'master-page-tag';
    p1Label.innerHTML = '<strong>Page 1 (Front Side · Landscape Duplex)</strong> <span>🔍 Click / Tap to Zoom 200%</span>';
    const img1 = document.createElement('img');
    img1.className = 'master-sheet-img';
    img1.src = data.page1;
    img1.alt = data.title + ' - Page 1';
    img1.loading = 'lazy';
    img1.addEventListener('click', () => openImageFullscreen(data.page1, data.title + ' — Page 1 (Front)', data.pdf));
    p1Wrap.append(p1Label, img1);

    // Page 2 Box
    const p2Wrap = document.createElement('div');
    p2Wrap.className = 'master-page-box';
    p2Wrap.style.display = 'none';
    const p2Label = document.createElement('div');
    p2Label.className = 'master-page-tag';
    p2Label.innerHTML = '<strong>Page 2 (Back Side · Landscape Duplex)</strong> <span>🔍 Click / Tap to Zoom 200%</span>';
    const img2 = document.createElement('img');
    img2.className = 'master-sheet-img';
    img2.src = data.page2;
    img2.alt = data.title + ' - Page 2';
    img2.loading = 'lazy';
    img2.addEventListener('click', () => openImageFullscreen(data.page2, data.title + ' — Page 2 (Back)', data.pdf));
    p2Wrap.append(p2Label, img2);

    container.append(p1Wrap, p2Wrap);
    root.appendChild(container);

    // Tab Events
    tab1.addEventListener('click', () => {
      tab1.classList.add('active'); tab2.classList.remove('active'); tabBoth.classList.remove('active');
      p1Wrap.style.display = ''; p2Wrap.style.display = 'none';
    });
    tab2.addEventListener('click', () => {
      tab2.classList.add('active'); tab1.classList.remove('active'); tabBoth.classList.remove('active');
      p1Wrap.style.display = 'none'; p2Wrap.style.display = '';
    });
    tabBoth.addEventListener('click', () => {
      tabBoth.classList.add('active'); tab1.classList.remove('active'); tab2.classList.remove('active');
      p1Wrap.style.display = ''; p2Wrap.style.display = '';
    });

    return root;
  }


  // Dedicated In-App Cheatsheet Pop-Up Modal Viewer (No External Redirects, Keeps User in App)
  function openCheatsheetPopUp(opts) {
    if (!opts) return;
    const existing = document.getElementById('masterModal');
    if (existing) existing.remove();

    let zoom = 1.0;
    const modal = document.createElement('div');
    modal.id = 'masterModal';
    modal.className = 'master-img-modal';

    const bar = document.createElement('div');
    bar.className = 'master-modal-bar';

    const titleEl = document.createElement('div');
    titleEl.className = 'master-modal-title';
    titleEl.innerHTML = '<span>📄</span> <span>' + escapeHtml(opts.title || 'Cheatsheet Preview') + '</span>';

    const tools = document.createElement('div');
    tools.className = 'master-modal-tools';

    // Page switcher tabs if 2 pages exist
    let p1Wrap = null, p2Wrap = null;
    if (opts.page1 && opts.page2) {
      const tabsWrap = document.createElement('div');
      tabsWrap.className = 'master-modal-tabs';

      const tFront = document.createElement('button');
      tFront.type = 'button';
      tFront.className = 'master-modal-tab active';
      tFront.textContent = '📄 Front';

      const tBack = document.createElement('button');
      tBack.type = 'button';
      tBack.className = 'master-modal-tab';
      tBack.textContent = '📄 Back';

      const tBoth = document.createElement('button');
      tBoth.type = 'button';
      tBoth.className = 'master-modal-tab';
      tBoth.textContent = '📑 Both';

      tFront.addEventListener('click', (e) => {
        e.stopPropagation();
        tFront.classList.add('active'); tBack.classList.remove('active'); tBoth.classList.remove('active');
        if (p1Wrap) p1Wrap.style.display = '';
        if (p2Wrap) p2Wrap.style.display = 'none';
      });
      tBack.addEventListener('click', (e) => {
        e.stopPropagation();
        tBack.classList.add('active'); tFront.classList.remove('active'); tBoth.classList.remove('active');
        if (p1Wrap) p1Wrap.style.display = 'none';
        if (p2Wrap) p2Wrap.style.display = '';
      });
      tBoth.addEventListener('click', (e) => {
        e.stopPropagation();
        tBoth.classList.add('active'); tFront.classList.remove('active'); tBack.classList.remove('active');
        if (p1Wrap) p1Wrap.style.display = '';
        if (p2Wrap) p2Wrap.style.display = '';
      });

      tabsWrap.append(tFront, tBack, tBoth);
      tools.appendChild(tabsWrap);
    }

    // Zoom Controls
    const zoomLabel = document.createElement('span');
    zoomLabel.style.cssText = 'font-size:12px; font-weight:700; color:#cbd5e1; min-width:48px; text-align:center;';
    zoomLabel.textContent = '100%';

    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.type = 'button';
    zoomOutBtn.className = 'master-modal-btn';
    zoomOutBtn.textContent = '➖ Zoom Out';

    const zoomInBtn = document.createElement('button');
    zoomInBtn.type = 'button';
    zoomInBtn.className = 'master-modal-btn';
    zoomInBtn.textContent = '➕ Zoom In';

    const zoomFitBtn = document.createElement('button');
    zoomFitBtn.type = 'button';
    zoomFitBtn.className = 'master-modal-btn';
    zoomFitBtn.textContent = '🔄 Fit';

    const zoom150Btn = document.createElement('button');
    zoom150Btn.type = 'button';
    zoom150Btn.className = 'master-modal-btn';
    zoom150Btn.textContent = '🔍 150%';

    tools.append(zoomOutBtn, zoomLabel, zoomInBtn, zoomFitBtn, zoom150Btn);

    // Download Button
    if (opts.pdfUrl) {
      const dlBtn = document.createElement('a');
      dlBtn.className = 'master-modal-btn primary';
      dlBtn.href = opts.pdfUrl;
      const fn = opts.filename || (opts.pdfUrl ? opts.pdfUrl.split('/').pop() : 'cheatsheet.pdf');
      dlBtn.download = fn;
      dlBtn.target = '_blank';
      dlBtn.innerHTML = '📥 Download';
      tools.appendChild(dlBtn);
    }

    // Print Button
    const printBtn = document.createElement('button');
    printBtn.type = 'button';
    printBtn.className = 'master-modal-btn';
    printBtn.innerHTML = '🖨️ Print';
    printBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const win = window.open(opts.pdfUrl, '_blank');
      if (win) {
        win.focus();
        setTimeout(() => { try { win.print(); } catch(e) {} }, 500);
      }
    });
    tools.appendChild(printBtn);

    // Close Button
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'master-modal-btn';
    closeBtn.textContent = '✕ Close';
    tools.appendChild(closeBtn);

    bar.append(titleEl, tools);
    modal.appendChild(bar);

    // Modal Body Content
    const body = document.createElement('div');
    body.className = 'master-modal-body';

    let zoomTarget = null;

    if (opts.page1 && opts.page2) {
      const pagesContainer = document.createElement('div');
      pagesContainer.style.cssText = 'display:flex; flex-direction:column; gap:20px; align-items:center; transform-origin:top center; transition:transform 0.15s ease-out;';
      zoomTarget = pagesContainer;

      p1Wrap = document.createElement('div');
      const img1 = document.createElement('img');
      img1.className = 'master-modal-img';
      img1.src = opts.page1;
      img1.alt = (opts.title || '') + ' - Page 1';
      p1Wrap.appendChild(img1);

      p2Wrap = document.createElement('div');
      p2Wrap.style.display = 'none';
      const img2 = document.createElement('img');
      img2.className = 'master-modal-img';
      img2.src = opts.page2;
      img2.alt = (opts.title || '') + ' - Page 2';
      p2Wrap.appendChild(img2);

      pagesContainer.append(p1Wrap, p2Wrap);
      body.appendChild(pagesContainer);
    } else if (opts.page1) {
      const img = document.createElement('img');
      img.className = 'master-modal-img';
      img.src = opts.page1;
      img.alt = opts.title || 'Cheatsheet';
      zoomTarget = img;
      body.appendChild(img);
    } else if (opts.sheetDOM || opts.html) {
      const viewport = document.createElement('div');
      viewport.className = 'master-sheet-viewport';
      zoomTarget = viewport;
      if (opts.sheetDOM) {
        const cloned = opts.sheetDOM.cloneNode(true);
        const t1 = cloned.querySelector('.duplex-tab:nth-child(1)');
        const t2 = cloned.querySelector('.duplex-tab:nth-child(2)');
        const tBoth = cloned.querySelector('.duplex-tab:nth-child(3)');
        const p1 = cloned.querySelector('.duplex-page.page-1') || cloned.querySelectorAll('.duplex-page')[0];
        const p2 = cloned.querySelector('.duplex-page.page-2') || cloned.querySelectorAll('.duplex-page')[1];
        if (t1 && t2 && p1 && p2) {
          t1.addEventListener('click', () => {
            t1.classList.add('active'); t2.classList.remove('active'); if (tBoth) tBoth.classList.remove('active');
            p1.style.display = ''; p2.style.display = 'none';
          });
          t2.addEventListener('click', () => {
            t2.classList.add('active'); t1.classList.remove('active'); if (tBoth) tBoth.classList.remove('active');
            p1.style.display = 'none'; p2.style.display = '';
          });
          if (tBoth) {
            tBoth.addEventListener('click', () => {
              tBoth.classList.add('active'); t1.classList.remove('active'); t2.classList.remove('active');
              p1.style.display = ''; p2.style.display = '';
            });
          }
        }
        viewport.appendChild(cloned);
      } else if (opts.html) {
        viewport.innerHTML = opts.html;
      }
      body.appendChild(viewport);
    } else if (opts.pdfUrl) {
      const iframeWrap = document.createElement('div');
      iframeWrap.className = 'master-modal-iframe-wrap';
      const iframe = document.createElement('iframe');
      iframe.className = 'master-modal-iframe';
      iframe.src = opts.pdfUrl + '#toolbar=0';
      iframeWrap.appendChild(iframe);
      body.appendChild(iframeWrap);
    }

    modal.appendChild(body);
    document.body.appendChild(modal);

    function applyZoom(z) {
      zoom = Math.max(0.4, Math.min(3.0, z));
      if (zoomTarget) {
        zoomTarget.style.transform = 'scale(' + zoom + ')';
      }
      zoomLabel.textContent = Math.round(zoom * 100) + '%';
      if (zoom > 1.0) {
        body.style.alignItems = 'flex-start';
        body.style.justifyContent = 'flex-start';
      } else {
        body.style.alignItems = 'flex-start';
        body.style.justifyContent = 'center';
      }
    }

    zoomInBtn.addEventListener('click', (e) => { e.stopPropagation(); applyZoom(zoom + 0.25); });
    zoomOutBtn.addEventListener('click', (e) => { e.stopPropagation(); applyZoom(zoom - 0.25); });
    zoomFitBtn.addEventListener('click', (e) => { e.stopPropagation(); applyZoom(1.0); });
    zoom150Btn.addEventListener('click', (e) => { e.stopPropagation(); applyZoom(1.5); });

    function closeModal() {
      modal.remove();
      window.removeEventListener('keydown', onKeyDown);
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') closeModal();
      else if (e.key === '+' || e.key === '=') applyZoom(zoom + 0.25);
      else if (e.key === '-' || e.key === '_') applyZoom(zoom - 0.25);
      else if (e.key === '0') applyZoom(1.0);
    }

    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeModal(); });
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target === body) closeModal();
    });
    window.addEventListener('keydown', onKeyDown);
  }

  // Handle in-chat iterative updates to the active cheatsheet
  function updateActiveCheatsheet(newDoc, botMsg) {
    const state = window.activeCheatsheetState;
    if (!state) return;
    state.doc = newDoc;
    if (newDoc.title) state.title = newDoc.title;

    // Rebuild sheet DOM
    const newSheetDOM = buildSheetDOM(newDoc, state.uA || 0, state.alias);
    stripAdviceNodes(newSheetDOM);
    state.sheetDOM = newSheetDOM;

    // Rebuild standalone HTML & Blob
    const standaloneHTML = generateStandaloneSheetHTML(newSheetDOM, state.title, getUnitPaletteClass(state.uA || 0));
    const blob = new Blob([standaloneHTML], { type: 'text/html' });
    state.pdfUrl = URL.createObjectURL(blob);
    state.html = standaloneHTML;

    // Render an update card in chat
    const updatedCard = buildSheetExportCard({
      title: state.title,
      subtitle: (state.subtitle || '') + ' · Updated via AI Iteration',
      faculty: state.faculty || 'B.Tech IT · Semester 1',
      badge: `✨ ITERATED & UPDATED · ${newDoc.boxes.length} DENSE TOPIC CARDS`,
      pdfUrl: state.pdfUrl,
      sheetDOM: newSheetDOM,
      html: standaloneHTML,
      filename: (state.alias || 'sheet') + '-updated-cheatsheet.html',
      isMaster: false
    });
    if (botMsg) {
      botMsg.appendChild(updatedCard);
    } else {
      chatArea.appendChild(updatedCard);
    }
    chatArea.scrollTop = chatArea.scrollHeight;

    // If modal is open, live refresh it!
    const modal = document.getElementById('masterModal');
    if (modal) {
      openCheatsheetPopUp({
        title: state.title,
        subtitle: state.subtitle,
        faculty: state.faculty,
        pdfUrl: state.pdfUrl,
        sheetDOM: newSheetDOM,
        html: standaloneHTML,
        badge: `✨ ITERATED & UPDATED · ${newDoc.boxes.length} DENSE TOPIC CARDS`,
        isMaster: false
      });
    }
    showToast('Cheatsheet updated with your changes! 🎨');
  }

  // Clean Cheatsheet Export & Launch Card with In-App Pop-Up Window Hand-off
  function buildSheetExportCard(opts) {
    const root = document.createElement('div');
    root.className = 'sheet-export-card';

    const header = document.createElement('div');
    header.className = 'sheet-export-header';

    const badgeEl = document.createElement('span');
    badgeEl.className = 'sheet-export-badge' + (opts.isMaster ? ' master' : '');
    badgeEl.textContent = opts.badge || (opts.isMaster ? '🌟 46 DENSE TOPIC CARDS · VERIFIED DUPLEX A4 LANDSCAPE' : '📄 24 DENSE TOPIC CARDS · PRINT-READY A4');

    const titleEl = document.createElement('h3');
    titleEl.className = 'sheet-export-title';
    titleEl.textContent = opts.title || 'Examination Cheatsheet';

    const subEl = document.createElement('p');
    subEl.className = 'sheet-export-sub';
    subEl.innerHTML = '<strong>Coverage:</strong> ' + escapeHtml(opts.subtitle || '') + (opts.faculty ? ' · <strong>Faculty:</strong> ' + escapeHtml(opts.faculty) : '');

    header.append(badgeEl, titleEl, subEl);
    root.appendChild(header);

    const actions = document.createElement('div');
    actions.className = 'sheet-export-actions';

    // PRIMARY ACTION: Open In-App Pop-Up Window (Never leaving StudyForged)
    const openInAppBtn = document.createElement('button');
    openInAppBtn.type = 'button';
    openInAppBtn.className = 'btn-export-primary';
    openInAppBtn.innerHTML = '👁️ Open Cheatsheet (In-App Pop-Up Viewer)';
    openInAppBtn.addEventListener('click', () => {
      openCheatsheetPopUp(opts);
    });
    actions.appendChild(openInAppBtn);

    // SECONDARY ROW: Download PDF & Direct Print
    const row = document.createElement('div');
    row.className = 'sheet-export-row';

    const dlBtn = document.createElement('a');
    dlBtn.className = 'btn-export-secondary';
    dlBtn.href = opts.pdfUrl;
    const filename = opts.filename || (opts.pdfUrl ? opts.pdfUrl.split('/').pop() : 'cheatsheet.pdf');
    dlBtn.download = filename;
    dlBtn.target = '_blank';
    dlBtn.innerHTML = '📥 Download ' + (opts.isMaster ? 'PDF (A4)' : 'Cheatsheet');

    const printBtn = document.createElement('button');
    printBtn.type = 'button';
    printBtn.className = 'btn-export-secondary';
    printBtn.innerHTML = '🖨️ Direct Print';
    printBtn.addEventListener('click', () => {
      const win = window.open(opts.pdfUrl, '_blank');
      if (win) {
        win.focus();
        setTimeout(() => { try { win.print(); } catch(e) {} }, 500);
      }
    });

    row.append(dlBtn, printBtn);
    actions.appendChild(row);

    root.appendChild(actions);

    const footer = document.createElement('div');
    footer.className = 'sheet-export-info';
    footer.innerHTML = '<span>💡 <strong>In-App Viewer & AI Iteration:</strong> Tap <strong>Open Cheatsheet</strong> above to inspect full-screen without leaving the app. You can also chat below to edit formulas, add topics, or request layout tweaks!</span>';
    root.appendChild(footer);

    return root;
  }

  function fillSheetUnits() {
    if (!sheetUnit || !sheetSubject) return;
    const alias = sheetSubject.value;
    const s = sheetSubjects().find(x => x.alias === alias);
    const units = (s && Array.isArray(s.units)) ? s.units : [];
    sheetUnit.innerHTML = '';

    if (units.length >= 2) {
      const d1 = document.createElement('option');
      d1.value = 'duplex-0-1';
      d1.textContent = '📑 Units 1 & 2 — Duplex A4 Landscape Sheet (2 Pages)';
      sheetUnit.appendChild(d1);
    }
    if (units.length >= 4) {
      const d2 = document.createElement('option');
      d2.value = 'duplex-2-3';
      d2.textContent = '📑 Units 3 & 4 — Duplex A4 Landscape Sheet (2 Pages)';
      sheetUnit.appendChild(d2);
    }

    units.forEach((u, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      const preview = String(u).split(':').slice(1).join(':').trim().slice(0, 44);
      o.textContent = `Unit ${i + 1}${preview ? ` — ${preview}…` : ''}`;
      sheetUnit.appendChild(o);
    });
  }
  function setSheetMode(on) {
    if (modeChatBtn) {
      modeChatBtn.classList.toggle('active', !on);
      modeChatBtn.setAttribute('aria-selected', String(!on));
    }
    if (modeSheetBtn) {
      modeSheetBtn.classList.toggle('active', on);
      modeSheetBtn.setAttribute('aria-selected', String(on));
    }
    if (sheetBar) sheetBar.style.display = on ? '' : 'none';
    if (sheetStatus) sheetStatus.style.display = 'none';
    if (chatInputBar) chatInputBar.style.display = on ? 'none' : '';
  }
  if (modeChatBtn) modeChatBtn.addEventListener('click', () => setSheetMode(false));
  if (modeSheetBtn) modeSheetBtn.addEventListener('click', () => setSheetMode(true));
  // Server-side model is pinned to meta/muse-ember. The UI control is informational only.
  const modelSelect = document.getElementById('aiModelSelect');
  if (modelSelect) modelSelect.value = DEFAULT_VERCEL_MODEL;
  if (sheetSubject) sheetSubject.addEventListener('change', fillSheetUnits);
  fillSheetSubjects();

  // Official 2026 syllabus grounding: exact unit topics the sheet MUST cover in full.
  function getSheetUnitContext(alias, unitIdx) {
    const s = sheetSubjects().find(x => x.alias === alias);
    if (!s) return '';
    const fac = (typeof SF_FACULTY !== 'undefined' && SF_FACULTY[alias]) ? SF_FACULTY[alias].faculty : '';
    const unitText = (Array.isArray(s.units) && s.units[unitIdx]) ? s.units[unitIdx] : '';
    return `Subject: ${s.name} (${s.code}) · Faculty: ${fac} · Textbook: ${s.book || ''}\nExam: ${s.marking || '40 internal + 60 external'}\nUnit ${unitIdx + 1} syllabus — cover EVERY subtopic below, none skipped:\n${unitText}`;
  }

  // Strip scripts/handlers/inline styles from AI sheet HTML (same trust posture as flashcard SVG).
  // ── Cheatsheet JSON contract: model returns DATA, renderer draws identical boxes ──
  // (freeform HTML was un-fittable by construction — this kills the bug class).
  const SHEET_LAYOUTS = ['table', 'flow', 'compare', 'values', 'code'];
  const SHEET_ADVICE_ANY_RE = /\b(common mistakes?|watch out|keep in mind|pro tips?)\b/i;

  function sheetClip(s, n) {
    s = String(s == null ? '' : s).trim();
    return s.length > n ? s.slice(0, n - 1).trim() + '…' : s;
  }
  function sheetCleanLine(s, n) {
    // Advice-shaped lines never enter the page, whatever the model emits.
    const t = sheetClip(s, n || 220);
    if (!t || sheetIsAdvice(t)) return '';
    return t;
  }
  function sheetIsAdvice(t) {
    const x = String(t || '').trim();
    if (!x) return false;
    if (/^(remember|note|warning|traps?|tips?|tricks?|hacks?)\b/i.test(x)) return true;
    if (SHEET_ADVICE_ANY_RE.test(x)) return true;
    return false;
  }
  // Escaped text + inline \( \) KaTeX (model strings only — never raw HTML).
  function sheetText(s) {
    const esc = escapeHtml(String(s == null ? '' : s));
    if (typeof katex === 'undefined') return esc;
    return esc.replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => {
      try { return katex.renderToString(String(m).trim(), { displayMode: false, throwOnError: true }); }
      catch (e) { return _; }
    });
  }
  // Raw LaTeX (table/compare formula cells) → KaTeX, fallback to plain text.
  function sheetFormula(tex) {
    const t = String(tex == null ? '' : tex).trim();
    if (!t) return null;
    if (typeof katex !== 'undefined') {
      try {
        const span = document.createElement('span');
        span.innerHTML = katex.renderToString(t, { displayMode: false, throwOnError: true });
        return span;
      } catch (e) {}
    }
    return document.createTextNode(t);
  }
  function sheetStar(s) {
    const starred = /^\s*★/.test(String(s || ''));
    return { starred, text: String(s || '').replace(/^\s*★\s*/, '') };
  }
  function normalizeSheetBox(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = sheetClip(raw.title, 80);
    // Advice-titled boxes (TIPS, TRAPS, ...) die with the whole box.
    if (!title || sheetIsAdvice(title) || /^(exam\s+)?(tips?|tricks?|hacks?|traps?|warnings?|important notes?|things to remember|key points|to remember)\b/i.test(title)) return null;
    const layout = SHEET_LAYOUTS.includes(raw.layout) ? raw.layout : 'table';
    const box = { title, layout };
    const strArr = (v, cap, len) => (Array.isArray(v) ? v : []).map(x => sheetCleanLine(x, len)).filter(Boolean).slice(0, cap);

    if (raw.desc) box.desc = sheetCleanLine(raw.desc, 240);
    if (raw.eq) box.eq = sheetClip(raw.eq, 180);
    if (raw.example) box.example = sheetCleanLine(raw.example, 220);

    if (layout === 'flow') {
      box.steps = strArr(raw.steps, 6, 160);
      if (!box.steps.length) return null;
    } else if (layout === 'compare') {
      const rows = (Array.isArray(raw.rows) ? raw.rows : []).slice(0, 6);
      box.left = sheetClip(raw.left || 'A', 40);
      box.right = sheetClip(raw.right || 'B', 40);
      box.rows = rows.map(r => {
        const a = Array.isArray(r) ? r : [r];
        if (sheetIsAdvice(a[0]) || sheetIsAdvice(a[1])) return null;
        return [sheetCleanLine(a[0], 160), sheetCleanLine(a[1], 160)];
      }).filter(r => r && (r[0] || r[1]));
      if (!box.rows.length) return null;
    } else if (layout === 'values') {
      box.items = strArr(raw.items, 8, 120);
      if (!box.items.length) return null;
    } else if (layout === 'code') {
      box.code = sheetClip(raw.code, 400);
      box.notes = strArr(raw.notes, 3, 140);
      if (!box.code && !box.notes.length) return null;
    } else {
      const rows = (Array.isArray(raw.rows) ? raw.rows : []).slice(0, 6);
      box.rows = rows.map(r => {
        const a = Array.isArray(r) ? r : [r];
        if (sheetIsAdvice(a[0]) || sheetIsAdvice(a[1])) return null;
        return [sheetCleanLine(a[0], 120), sheetCleanLine(a[1], 220)];
      }).filter(r => r && (r[0] || r[1]));
      if (!box.rows.length && !box.desc && !box.eq) return null;
    }
    return box;
  }
  // Bracket-balance repair for truncated JSON (same failure mode as quiz/flashcards).
  // v0.6.38: LIFO stack — the old braces-then-brackets order emitted mismatched closers.
  function sheetBalance(s) {
    let t = String(s || '');
    let inStr = false, esc = false;
    const stack = [];
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
      } else {
        if (c === '"') inStr = true;
        else if (c === '{' || c === '[') stack.push(c);
        else if ((c === '}' || c === ']') && stack.length) stack.pop();
      }
    }
    if (inStr) t += '"';
    while (stack.length) t += (stack.pop() === '{' ? '}' : ']');
    return t;
  }
  function sheetParseDoc(raw) {
    let cleaned = String(raw || '').trim().replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/i, '').trim();
    const fb = cleaned.indexOf('{');
    const lb = cleaned.lastIndexOf('}');
    if (fb !== -1 && lb !== -1 && lb > fb) cleaned = cleaned.substring(fb, lb + 1);

    let doc = null;

    // Tier 1: Direct JSON parse
    try {
      doc = JSON.parse(cleaned);
    } catch (e1) {
      // Tier 2: LLM syntax repair for trailing commas, unescaped double closing braces (}} before , { or ])
      try {
        const sanitized = cleaned
          .replace(/,\s*([\]}])/g, '$1')
          .replace(/\}\}\s*(?=,\s*\{)/g, '}')
          .replace(/\}\}\s*\]/g, '}]');
        doc = JSON.parse(sanitized);
      } catch (e2) {
        doc = null;
      }
    }

    // Tier 3: Element-by-element array extraction fallback
    if (!doc || typeof doc !== 'object' || !Array.isArray(doc.boxes || doc)) {
      const titleMatch = cleaned.match(/"title"\s*:\s*"([^"]+)"/);
      const title = titleMatch ? sheetClip(titleMatch[1], 90) : 'UNIT CHEATSHEET';

      const boxesIdx = cleaned.indexOf('"boxes"');
      const searchStr = boxesIdx !== -1 ? cleaned.slice(boxesIdx) : cleaned;
      const arrStart = searchStr.indexOf('[');

      const validBoxes = [];
      if (arrStart !== -1) {
        let i = arrStart + 1;
        while (i < searchStr.length) {
          const start = searchStr.indexOf('{', i);
          if (start === -1) break;

          let depth = 0, inStr = false, esc = false, end = -1;
          for (let j = start; j < searchStr.length; j++) {
            const c = searchStr[j];
            if (inStr) {
              if (esc) esc = false;
              else if (c === '\\') esc = true;
              else if (c === '"') inStr = false;
            } else {
              if (c === '"') inStr = true;
              else if (c === '{') depth++;
              else if (c === '}') {
                depth--;
                if (depth === 0) { end = j; break; }
              }
            }
          }

          if (end !== -1) {
            let chunk = searchStr.slice(start, end + 1).replace(/,\s*([\]}])/g, '$1');
            let box = null;
            try { box = JSON.parse(chunk); }
            catch (eChunk) {
              if (chunk.endsWith('}}')) {
                try { box = JSON.parse(chunk.slice(0, -1)); } catch (eRetry) {}
              }
            }
            if (box) {
              try {
                const norm = normalizeSheetBox(box);
                if (norm) validBoxes.push(norm);
              } catch (eNorm) {}
            }
            if (validBoxes.length >= 30) break;
            i = end + 1;
          } else {
            break;
          }
        }
      }

      if (validBoxes.length >= 3) {
        return { title, boxes: validBoxes };
      }
      return null;
    }

    const boxes = Array.isArray(doc) ? doc : doc.boxes;
    if (!Array.isArray(boxes)) return null;
    const title = sheetClip(doc.title || '', 90);
    const valid = [];
    for (const b of boxes) {
      try {
        const n = normalizeSheetBox(b);
        if (n) valid.push(n);
      } catch (e) {}
      if (valid.length >= 30) break;
    }
    if (valid.length < 3) return null;
    return { title, boxes: valid };
  }

  // ── Cheatsheet Layout & Leveling Engine (Skill Port) ──
  function getRomanNumeral(idx) {
    const r = ['I', 'II', 'III', 'IV', 'V', 'VI'];
    return r[idx] || String(idx + 1);
  }
  function getUnitPaletteClass(idx) {
    const p = ['u1', 'u2', 'u3', 'u4'];
    return p[idx % 4] || 'u1';
  }

  // Fast content-based height estimation for unmounted cards
  function estimateCardHeight(cardEl) {
    if (cardEl && cardEl.isConnected) {
      const r = cardEl.getBoundingClientRect();
      if (r.height > 0) return r.height;
    }
    let h = 26; // base card padding + h3 header
    cardEl.querySelectorAll('p').forEach(p => { h += 14 + Math.ceil(p.textContent.length / 32) * 11; });
    cardEl.querySelectorAll('.eq').forEach(() => { h += 24; });
    cardEl.querySelectorAll('.ex').forEach(ex => { h += 16 + Math.ceil(ex.textContent.length / 32) * 11; });
    cardEl.querySelectorAll('.flow').forEach(() => { h += 22; });
    cardEl.querySelectorAll('table').forEach(t => { h += 12 + t.querySelectorAll('tr').length * 13; });
    cardEl.querySelectorAll('ul li').forEach(() => { h += 13; });
    cardEl.querySelectorAll('pre').forEach(p => { h += 14 + (p.textContent.split('\n').length || 1) * 12; });
    return Math.max(h, 30);
  }

  // Measure card heights in an off-screen container matching sheet geometry
  function measureCardHeights(cardElements, colWidthPx) {
    const scratch = document.createElement('div');
    scratch.style.cssText = `position: absolute; left: -9999px; top: -9999px; width: ${colWidthPx || 220}px; visibility: hidden; pointer-events: none;`;
    scratch.className = 'cheatsheet-sheet';
    document.body.appendChild(scratch);
    const heights = [];
    cardElements.forEach(c => {
      scratch.appendChild(c);
      const h = c.getBoundingClientRect().height || estimateCardHeight(c);
      heights.push(h);
    });
    scratch.remove();
    return heights;
  }

  // JavaScript port of pack(h) from make_sheet.py:
  // Split card heights into K bins: min max-bin, then most even (greedy + 2-opt leveling)
  function packCards(heights, numCols) {
    const K = numCols || 4;
    const n = heights.length;
    if (n <= K) {
      const bins = [];
      for (let i = 0; i < K; i++) bins.push(i < n ? [i] : []);
      return bins;
    }
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => heights[b] - heights[a]);
    let bins = Array.from({ length: K }, () => []);
    const sums = new Array(K).fill(0);
    for (const i of order) {
      let minIdx = 0;
      for (let j = 1; j < K; j++) {
        if (sums[j] < sums[minIdx]) minIdx = j;
      }
      bins[minIdx].push(i);
      sums[minIdx] += heights[i];
    }

    function obj(bs) {
      const s = bs.map(b => b.reduce((acc, idx) => acc + (heights[idx] || 0), 0));
      const maxVal = Math.max(...s);
      const sumSq = s.reduce((acc, v) => acc + v * v, 0);
      return [maxVal, sumSq];
    }

    function isBetter(o1, o2) {
      if (o1[0] < o2[0] - 0.01) return true;
      if (Math.abs(o1[0] - o2[0]) < 0.01 && o1[1] < o2[1] - 0.01) return true;
      return false;
    }

    let best = obj(bins);
    let improved = true;
    let loops = 0;
    while (improved && loops++ < 80) {
      improved = false;
      for (let a = 0; a < K; a++) {
        for (let b = 0; b < K; b++) {
          if (a === b) continue;
          // Move one card from a to b
          for (let idx = 0; idx < bins[a].length; idx++) {
            const item = bins[a][idx];
            const nb = bins.map(col => [...col]);
            nb[a].splice(idx, 1);
            nb[b].push(item);
            const cand = obj(nb);
            if (isBetter(cand, best)) {
              bins = nb;
              best = cand;
              improved = true;
              break;
            }
          }
          if (improved) break;
          // Swap two cards
          for (let ia = 0; ia < bins[a].length; ia++) {
            for (let ib = 0; ib < bins[b].length; ib++) {
              const itemA = bins[a][ia];
              const itemB = bins[b][ib];
              const nb = bins.map(col => [...col]);
              nb[a][ia] = itemB;
              nb[b][ib] = itemA;
              const cand = obj(nb);
              if (isBetter(cand, best)) {
                bins = nb;
                best = cand;
                improved = true;
                break;
              }
            }
            if (improved) break;
          }
          if (improved) break;
        }
        if (improved) break;
      }
    }
    // Sort items within each bin by original index to keep syllabus flow
    return bins.map(b => b.sort((x, y) => x - y));
  }

  // Authentic card builder supporting formulas (.eq), worked examples (.ex), flow chips (.flow), tables, and clean lists
  function buildSheetCard(b, cardIndex) {
    const card = document.createElement('div');
    card.className = 'card';

    const h3 = document.createElement('h3');
    const badge = document.createElement('span');
    badge.className = 'n';
    badge.textContent = String(cardIndex != null ? cardIndex : 1);
    h3.appendChild(badge);
    const titleSpan = document.createElement('span');
    titleSpan.className = 'card-title-text';
    titleSpan.textContent = ' ' + b.title;
    h3.appendChild(titleSpan);
    card.appendChild(h3);

    if (b.desc) {
      const p = document.createElement('p');
      p.innerHTML = `<b>Def:</b> ${sheetText(b.desc)}`;
      card.appendChild(p);
    }

    if (b.eq) {
      const eqDiv = document.createElement('div');
      eqDiv.className = 'eq';
      const f = sheetFormula(b.eq);
      if (f) eqDiv.appendChild(f);
      else eqDiv.innerHTML = sheetText(b.eq);
      card.appendChild(eqDiv);
    }

    if (b.layout === 'flow') {
      const flowDiv = document.createElement('div');
      flowDiv.className = 'flow';
      (b.steps || []).forEach((s, idx) => {
        if (idx > 0) {
          const arr = document.createElement('span');
          arr.className = 'arr';
          arr.innerHTML = '&rarr;';
          flowDiv.appendChild(arr);
        }
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.innerHTML = sheetText(s);
        flowDiv.appendChild(chip);
      });
      card.appendChild(flowDiv);
    } else if (b.layout === 'compare') {
      const tbl = document.createElement('table');
      const trH = document.createElement('tr');
      const th1 = document.createElement('th');
      th1.textContent = b.left || 'A';
      const th2 = document.createElement('th');
      th2.textContent = b.right || 'B';
      trH.append(th1, th2);
      tbl.appendChild(trH);
      (b.rows || []).forEach(r => {
        const tr = document.createElement('tr');
        const td1 = document.createElement('td');
        td1.innerHTML = sheetText(r[0] || '—');
        const td2 = document.createElement('td');
        td2.innerHTML = sheetText(r[1] || '—');
        tr.append(td1, td2);
        tbl.appendChild(tr);
      });
      card.appendChild(tbl);
    } else if (b.layout === 'values') {
      const ul = document.createElement('ul');
      (b.items || []).forEach(it => {
        const li = document.createElement('li');
        li.innerHTML = sheetText(it);
        ul.appendChild(li);
      });
      card.appendChild(ul);
    } else if (b.layout === 'code') {
      if (b.code) {
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = b.code;
        pre.appendChild(code);
        card.appendChild(pre);
      }
      if (b.notes && b.notes.length) {
        const ul = document.createElement('ul');
        b.notes.forEach(n => {
          const li = document.createElement('li');
          li.innerHTML = sheetText(n);
          ul.appendChild(li);
        });
        card.appendChild(ul);
      }
    } else {
      // 'table' layout
      if (b.rows && b.rows.length) {
        const regularRows = [];
        b.rows.forEach(r => {
          const label = String(r[0] || '').trim();
          const val = String(r[1] || '').trim();
          if (/^e\.?g\.?|example\b/i.test(label) || /^e\.?g\.?|example\b/i.test(val)) {
            const exDiv = document.createElement('div');
            exDiv.className = 'ex';
            exDiv.innerHTML = `<span class="t">Eg.</span> ${sheetText(val || label)}`;
            card.appendChild(exDiv);
          } else {
            regularRows.push(r);
          }
        });

        if (regularRows.length) {
          const tbl = document.createElement('table');
          regularRows.forEach(r => {
            const tr = document.createElement('tr');
            const td0 = document.createElement('td');
            td0.innerHTML = sheetText(r[0] || '—');
            const td1 = document.createElement('td');
            const fsrc = String(r[1] || '').trim();
            if (!fsrc) {
              td1.textContent = '—';
            } else {
              const f = sheetFormula(fsrc);
              if (f) td1.appendChild(f);
              else td1.innerHTML = sheetText(fsrc);
            }
            tr.append(td0, td1);
            tbl.appendChild(tr);
          });
          card.appendChild(tbl);
        }
      }
    }

    if (b.example) {
      const exDiv = document.createElement('div');
      exDiv.className = 'ex';
      exDiv.innerHTML = `<span class="t">Eg.</span> ${sheetText(b.example)}`;
      card.appendChild(exDiv);
    }

    return card;
  }

  // Single-unit 4-column balanced A4 landscape sheet
  function buildSheetDOM(doc, unitIdx, alias) {
    const s = sheetSubjects().find(x => x.alias === alias);
    const fac = (typeof SF_FACULTY !== 'undefined' && SF_FACULTY[alias]) ? SF_FACULTY[alias].faculty : '';
    const code = (s && s.code) || alias;
    const rU = getRomanNumeral(unitIdx);
    const pal = getUnitPaletteClass(unitIdx);

    const sheet = document.createElement('div');
    sheet.className = `cheatsheet-sheet ${pal}`;

    const banner = document.createElement('div');
    banner.className = 'banner';
    const bTitle = document.createElement('div');
    bTitle.textContent = `UNIT ${rU} · ${doc.title || ('UNIT ' + rU)}`;
    const bSub = document.createElement('span');
    bSub.textContent = `${code} · ${fac || 'B.Tech IT'}`;
    banner.append(bTitle, bSub);
    sheet.appendChild(banner);

    const cols = document.createElement('div');
    cols.className = 'cols';
    const colEls = [];
    for (let i = 0; i < 4; i++) {
      const c = document.createElement('div');
      c.className = 'col';
      colEls.push(c);
      cols.appendChild(c);
    }
    sheet.appendChild(cols);

    const cards = (doc.boxes || []).map((b, i) => buildSheetCard(b, i + 1));
    const heights = measureCardHeights(cards, 220);
    const bins = packCards(heights, 4);

    let seq = 1;
    bins.forEach((binCards, colIdx) => {
      binCards.forEach(idx => {
        const c = cards[idx];
        const bdg = c.querySelector('.n');
        if (bdg) bdg.textContent = String(seq++);
        colEls[colIdx].appendChild(c);
      });
    });

    return sheet;
  }

  // Two-page Duplex A4 landscape sheet (Front: uA | uB, Back: uB | uA reversed blueprint)
  function buildDuplexSheetDOM(docA, docB, uA, uB, alias) {
    const s = sheetSubjects().find(x => x.alias === alias);
    const fac = (typeof SF_FACULTY !== 'undefined' && SF_FACULTY[alias]) ? SF_FACULTY[alias].faculty : '';
    const code = (s && s.code) || alias;
    const rA = getRomanNumeral(uA);
    const rB = getRomanNumeral(uB);
    const palA = getUnitPaletteClass(uA);
    const palB = getUnitPaletteClass(uB);

    const root = document.createElement('div');
    root.className = 'cheatsheet-sheet duplex-sheet';

    const tabs = document.createElement('div');
    tabs.className = 'duplex-tabs';
    const tab1 = document.createElement('button');
    tab1.type = 'button';
    tab1.className = 'duplex-tab active';
    tab1.textContent = `📄 Page 1: Front (Unit ${rA} | Unit ${rB})`;
    const tab2 = document.createElement('button');
    tab2.type = 'button';
    tab2.className = 'duplex-tab';
    tab2.textContent = `📄 Page 2: Back (Unit ${rB} | Unit ${rA})`;
    const tabBoth = document.createElement('button');
    tabBoth.type = 'button';
    tabBoth.className = 'duplex-tab';
    tabBoth.textContent = '📑 Both Pages (Print Preview)';
    tabs.append(tab1, tab2, tabBoth);
    root.appendChild(tabs);

    const cardsA = (docA.boxes || []).map((b, i) => buildSheetCard(b, i + 1));
    const heightsA = measureCardHeights(cardsA, 220);
    const binsA = packCards(heightsA, 4);

    const cardsB = (docB.boxes || []).map((b, i) => buildSheetCard(b, i + 1));
    const heightsB = measureCardHeights(cardsB, 220);
    const binsB = packCards(heightsB, 4);

    // Renumber Unit A cards 1..N
    let seqA = 1;
    [0, 1, 2, 3].forEach(k => {
      (binsA[k] || []).forEach(idx => {
        const bdg = cardsA[idx].querySelector('.n');
        if (bdg) bdg.textContent = String(seqA++);
      });
    });
    // Renumber Unit B cards 1..N
    let seqB = 1;
    [0, 1, 2, 3].forEach(k => {
      (binsB[k] || []).forEach(idx => {
        const bdg = cardsB[idx].querySelector('.n');
        if (bdg) bdg.textContent = String(seqB++);
      });
    });

    function createHalfUnit(unitClass, title, subtitle, colCards1, colCards2) {
      const half = document.createElement('div');
      half.className = `half-unit ${unitClass}`;
      half.setAttribute('data-unit', unitClass);
      const banner = document.createElement('div');
      banner.className = 'banner';
      const bTitle = document.createElement('div');
      bTitle.textContent = title;
      const bSub = document.createElement('span');
      bSub.textContent = subtitle;
      banner.append(bTitle, bSub);
      half.appendChild(banner);

      const cols = document.createElement('div');
      cols.className = 'cols';
      const col1 = document.createElement('div');
      col1.className = 'col';
      colCards1.forEach(c => col1.appendChild(c));
      const col2 = document.createElement('div');
      col2.className = 'col';
      colCards2.forEach(c => col2.appendChild(c));
      cols.append(col1, col2);
      half.appendChild(cols);
      return half;
    }

    // Page 1: Unit A (bins 0, 1) on Left | Unit B (bins 0, 1) on Right
    const page1 = document.createElement('div');
    page1.className = 'duplex-page page-1';
    const halfA_front = createHalfUnit(
      palA,
      `UNIT ${rA} · ${docA.title || 'UNIT ' + rA}`,
      `${code} · ${fac || 'B.Tech IT'}`,
      (binsA[0] || []).map(i => cardsA[i]),
      (binsA[1] || []).map(i => cardsA[i])
    );
    const halfB_front = createHalfUnit(
      palB,
      `UNIT ${rB} · ${docB.title || 'UNIT ' + rB}`,
      `${code} · ${fac || 'B.Tech IT'}`,
      (binsB[0] || []).map(i => cardsB[i]),
      (binsB[1] || []).map(i => cardsB[i])
    );
    page1.append(halfA_front, halfB_front);

    // Page 2: Unit B (bins 2, 3) on Left | Unit A (bins 2, 3) on Right (Short-Edge Duplex Flip)
    const page2 = document.createElement('div');
    page2.className = 'duplex-page page-2';
    page2.style.display = 'none';
    const halfB_back = createHalfUnit(
      palB,
      `UNIT ${rB} · ${docB.title || 'UNIT ' + rB} (contd.)`,
      `${code} · ${fac || 'B.Tech IT'}`,
      (binsB[2] || []).map(i => cardsB[i]),
      (binsB[3] || []).map(i => cardsB[i])
    );
    const halfA_back = createHalfUnit(
      palA,
      `UNIT ${rA} · ${docA.title || 'UNIT ' + rA} (contd.)`,
      `${code} · ${fac || 'B.Tech IT'}`,
      (binsA[2] || []).map(i => cardsA[i]),
      (binsA[3] || []).map(i => cardsA[i])
    );
    page2.append(halfB_back, halfA_back);

    root.append(page1, page2);

    tab1.addEventListener('click', () => {
      tab1.classList.add('active'); tab2.classList.remove('active'); tabBoth.classList.remove('active');
      page1.style.display = ''; page2.style.display = 'none';
    });
    tab2.addEventListener('click', () => {
      tab2.classList.add('active'); tab1.classList.remove('active'); tabBoth.classList.remove('active');
      page1.style.display = 'none'; page2.style.display = '';
    });
    tabBoth.addEventListener('click', () => {
      tabBoth.classList.add('active'); tab1.classList.remove('active'); tab2.classList.remove('active');
      page1.style.display = ''; page2.style.display = '';
    });

    return root;
  }

  // Generates complete, self-contained standalone HTML for export / copy
  function generateStandaloneSheetHTML(sheetElement, title, unitClass) {
    const css = `
@page { size: 297mm 210mm landscape; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; font-family: 'Carlito', 'Calibri', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 6.8pt; line-height: 1.18; color: #14202e; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
:root, .u1, body.u1 { --ac: #1a59a6; --ac2: #2f78c4; --soft: #f4f8fd; --line: #dbe5f1; --hd: #e1ecf9; --dk: #0d2a4d; --g1: #17407a; --g2: #2b6cb8; --mut: #46607e; }
.u2, body.u2 { --ac: #0f6b5f; --ac2: #1d9a86; --soft: #f2faf8; --line: #cfe8e3; --hd: #dcf1ec; --dk: #0b3b35; --g1: #0b4f47; --g2: #1b8f7b; --mut: #3f6b64; }
.u3, body.u3 { --ac: #5b21b6; --ac2: #7c3aed; --soft: #f5f3ff; --line: #ddd6fe; --hd: #ede9fe; --dk: #2e1065; --g1: #4c1d95; --g2: #6d28d9; --mut: #5b21b6; }
.u4, body.u4 { --ac: #b45309; --ac2: #d97706; --soft: #fffbeb; --line: #fde68a; --hd: #fef3c7; --dk: #78350f; --g1: #92400e; --g2: #b45309; --mut: #78350f; }
.banner { background: linear-gradient(90deg, var(--g1), var(--g2)); color: #fff; font-weight: 700; font-size: 8.5pt; padding: 3pt 7pt; border-radius: 3pt; margin-bottom: 3.5pt; display: flex; justify-content: space-between; align-items: center; }
.banner span { font-weight: 400; font-size: 6.2pt; opacity: 0.92; }
.cols { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2.4mm; height: 100%; }
.col { overflow: hidden; min-height: 0; display: flex; flex-direction: column; gap: 2pt; }
.card { background: var(--soft); border: 0.4pt solid var(--line); border-left: 2pt solid var(--ac2); border-radius: 2pt; padding: 1.6pt 3.5pt 2pt 4pt; margin-bottom: 2pt; font-size: 6.6pt; line-height: 1.18; color: #14202e; break-inside: avoid; }
.card h3 { font-size: 7.4pt; color: var(--ac); font-weight: 700; display: flex; align-items: center; gap: 2.5pt; margin: 0 0 1.5pt; }
.n { display: inline-block; background: var(--ac); color: #fff; border-radius: 2pt; min-width: 8pt; height: 8pt; text-align: center; font-size: 5.6pt; line-height: 8pt; padding: 0 1.2pt; font-weight: 800; flex-shrink: 0; }
b { font-weight: 700; color: var(--dk); }
p { margin: 0.6pt 0; overflow-wrap: break-word; }
table { border-collapse: collapse; width: 100%; margin: 1pt 0; font-size: 6pt; line-height: 1.14; }
th, td { border: 0.35pt solid var(--line); padding: 0.8pt 2.5pt; text-align: left; vertical-align: top; background: #fff; }
th { background: var(--hd); color: var(--dk); font-weight: 700; }
.eq { background: #fff; border: 0.4pt solid var(--line); border-left: 1.5pt solid var(--ac); border-radius: 2pt; padding: 1pt 3.5pt; margin: 1.2pt 0; font-size: 6.4pt; line-height: 1.35; color: var(--dk); }
.ex { border-left: 1.5pt solid #3f9a5a; padding: 1pt 3.5pt; margin: 1.2pt 0; background: #f0faf3; border-radius: 2pt; font-size: 6.2pt; line-height: 1.25; }
.ex .t { font-weight: 700; color: #256b3c; margin-right: 2pt; }
.flow { display: flex; flex-wrap: wrap; align-items: center; gap: 1.5pt 0; margin: 1.2pt 0; }
.chip { background: #fff; border: 0.5pt solid var(--ac2); border-radius: 2pt; padding: 0.5pt 3pt; font-weight: 700; color: var(--dk); font-size: 6pt; line-height: 1.15; }
.arr { color: var(--ac2); font-weight: 700; padding: 0 1.5pt; font-size: 7pt; }
ul { list-style: none; padding: 0; margin: 0.5pt 0; }
li { padding-left: 7pt; position: relative; margin: 0.3pt 0; }
li:before { content: ''; position: absolute; left: 1.8pt; top: 3.2pt; width: 2.2pt; height: 2.2pt; border-radius: 50%; background: var(--ac2); }
pre { background: #fff; border: 0.4pt solid var(--line); border-radius: 2pt; padding: 1.2pt 3.5pt; font-family: monospace; font-size: 6pt; margin: 1pt 0; white-space: pre-wrap; }
.duplex-page { width: 297mm; height: 210mm; display: grid; grid-template-columns: 146.5mm 146.5mm; gap: 3.5mm; padding: 3.5mm; box-sizing: border-box; page-break-after: always; break-after: page; background: #fff; }
.half-unit { width: 146.5mm; height: 100%; overflow: hidden; display: flex; flex-direction: column; }
.half-unit .cols { grid-template-columns: 1fr 1fr; }
.cheatsheet-sheet { width: 297mm; height: 210mm; padding: 3.5mm; box-sizing: border-box; background: #fff; }
.duplex-tabs { display: none !important; }
@media screen {
  .floating-print-bar { position: fixed; bottom: 18px; right: 18px; background: #0f172a; color: #fff; padding: 10px 16px; border-radius: 9999px; box-shadow: 0 4px 20px rgba(0,0,0,0.35); display: flex; align-items: center; gap: 12px; z-index: 999999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; font-weight: 600; }
  .floating-print-bar button { background: #2563eb; color: #fff; border: none; border-radius: 9999px; padding: 7px 15px; font-weight: 700; font-size: 12px; cursor: pointer; box-shadow: 0 2px 8px rgba(37,99,235,0.4); }
  .floating-print-bar button:hover { background: #1d4ed8; }
}
@media print {
  .floating-print-bar { display: none !important; }
}
`;
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title || 'Cheatsheet')}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
  <style>${css}</style>
</head>
<body class="${unitClass || 'u1'}">
${sheetElement.outerHTML}
</body>
</html>`;
  }

  // STRICT A4 fit: shrink type until content fits 210mm landscape bounds
  function fitSheetToPage(root, minPx) {
    if (!root || !root.isConnected) return;
    const pages = root.classList.contains('duplex-sheet')
      ? root.querySelectorAll('.duplex-page')
      : [root];
    pages.forEach(p => {
      const min = minPx || 5.8;
      p.style.fontSize = '';
      const fits = () => p.scrollHeight <= p.clientHeight + 2 && p.scrollWidth <= p.clientWidth + 2;
      if (p.clientHeight <= 0 || fits()) return;
      let lo = min, hi = parseFloat(getComputedStyle(p).fontSize) || 8.5;
      let best = min, guard = 0;
      while (hi - lo > 0.3 && guard++ < 12) {
        const mid = (lo + hi) / 2;
        p.style.fontSize = mid + 'px';
        if (p.scrollHeight <= p.clientHeight + 2 && p.scrollWidth <= p.clientWidth + 2) { best = mid; lo = mid; }
        else { hi = mid; }
      }
      p.style.fontSize = best + 'px';
    });
  }

  function refitVisibleSheets() {
    document.querySelectorAll('.cheatsheet-sheet, .duplex-sheet').forEach((s) => {
      if (s.offsetParent !== null) fitSheetToPage(s, 6.2);
    });
  }
  let sheetResizeTimer = null;
  window.addEventListener('resize', () => {
    if (sheetResizeTimer) clearTimeout(sheetResizeTimer);
    sheetResizeTimer = setTimeout(refitVisibleSheets, 250);
  });

  // Cheatsheet fullscreen viewer with interactive duplex tab preservation
  function openSheetFullscreen(html) {
    const fs = document.getElementById('sheetFullscreen');
    const body = document.getElementById('sheetFsBody');
    if (!fs || !body) return;
    body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    const t1 = wrap.querySelector('.duplex-tabs button:nth-child(1)');
    const t2 = wrap.querySelector('.duplex-tabs button:nth-child(2)');
    const tBoth = wrap.querySelector('.duplex-tabs button:nth-child(3)');
    const p1 = wrap.querySelector('.duplex-page.page-1');
    const p2 = wrap.querySelector('.duplex-page.page-2');
    if (t1 && t2 && p1 && p2) {
      t1.addEventListener('click', () => {
        t1.classList.add('active'); t2.classList.remove('active'); if (tBoth) tBoth.classList.remove('active');
        p1.style.display = ''; p2.style.display = 'none';
      });
      t2.addEventListener('click', () => {
        t2.classList.add('active'); t1.classList.remove('active'); if (tBoth) tBoth.classList.remove('active');
        p1.style.display = 'none'; p2.style.display = '';
      });
      if (tBoth) {
        tBoth.addEventListener('click', () => {
          tBoth.classList.add('active'); t1.classList.remove('active'); t2.classList.remove('active');
          p1.style.display = ''; p2.style.display = '';
        });
      }
    }
    body.appendChild(wrap);
    fs.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => fitSheetToPage(wrap, 7));
  }

  function closeSheetFullscreen() {
    const fs = document.getElementById('sheetFullscreen');
    if (!fs) return;
    fs.style.display = 'none';
    const qp = document.getElementById('quizPage');
    if (!qp || qp.style.display === 'none') document.body.style.overflow = '';
  }
  const sheetFsClose = document.getElementById('sheetFsClose');
  if (sheetFsClose) sheetFsClose.addEventListener('click', closeSheetFullscreen);
  const sheetFsBackdrop = document.getElementById('sheetFsBackdrop');
  if (sheetFsBackdrop) sheetFsBackdrop.addEventListener('click', closeSheetFullscreen);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const fs = document.getElementById('sheetFullscreen');
    if (fs && fs.style.display !== 'none') closeSheetFullscreen();
  });

  // Code-level advice scrubber: deletes trap/tip boxes and advice lines
  function stripAdviceNodes(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('.sheet-trap, .trap, .tips, .warnings').forEach(n => n.remove());
    root.querySelectorAll('h3, h4').forEach((h) => {
      if (/^(exam\s+)?(tips?|tricks?|hacks?|traps?|warnings?|important notes?|things to remember|key points|to remember)\b/i.test(h.textContent.trim())) {
        const box = h.closest('.card') || h.closest('.sheet-sec');
        (box || h).remove();
      }
    });
    root.querySelectorAll('li, p').forEach((el) => {
      const t = el.textContent.trim();
      if (!t) return;
      if (/^[⚠️💡⭐📌🔥❌❗👉]\s*(traps?|tips?|tricks?|hacks?|warnings?|pitfalls?|mistakes?|notes?|remember|warning)\b/iu.test(t)) { el.remove(); return; }
      if (/^(remember|note|warning|traps?|tips?|tricks?|hacks?)\b\s*[:\-]/i.test(t)) { el.remove(); return; }
      if (/\b(common mistakes?|watch out|keep in mind|pro tips?)\b/i.test(t)) { el.remove(); return; }
    });
  }

  // Fetch single-unit cheatsheet document from AI Gateway
  async function fetchUnitCheatsheetDoc(alias, unitIdx, signal) {
    const unitCtx = getSheetUnitContext(alias, unitIdx);
    if (!unitCtx) throw new Error(`Missing syllabus for ${alias} Unit ${unitIdx + 1}`);

    const system = `You are StudyForged Cheatsheet Engine for Satyam Kumar (B.Tech IT Sem-1, Sec-E, ADGIPS, GGSIPU 2026).
${unitCtx}

    TASK: Emit ONE ultra-dense, print-packed revision cheatsheet strictly following the cheatsheet-layout skill as raw JSON (no fences, no commentary) covering EVERY single subtopic in the syllabus above.

    STRICT SKILL DENSITY RULES:
    - PACKED INFORMATION DENSITY: Generate exactly 22 to 24 dense, exhaustive topic cards covering EVERY subtopic in the syllabus.
    - ZERO ADVICE BOXES: Never write advice, tips, tricks, warnings, hacks, remember, or pitfalls. BANNED: trap, tip, trick, warning, note, pro tip, careful. Zero fluff. Every square millimeter must be examinable technical content: definitions, derivations, formulas, numerical examples, and tables.
    - CORRECT FORMS, NOT SOLVING STEPS: Examples show the final correct form/result directly (e.g. "Eg. m = 1000 kg, v = 20 m/s -> K = 200 kJ").
    - FULL COVERAGE: Every single syllabus topic, formula, law, algorithm, and conversion gets an explicit card.
    - MICRO-NOTE BREVITY: High-yield fragments, never filler prose. Abbreviations: w/, thru, b/w, ->, ↑ ↓, Δ, ∴, ∵, ≈, ∝, ≤ ≥ ≠.

    STRICT JSON SCHEMA:
    {"title": "UNIT N — NAME", "boxes": [ <22-24 dense box objects covering every subtopic in syllabus order> ]}

BOX STRUCTURE:
Each box represents one topic card:
- "title": "CAPS TOPIC TITLE" (do NOT number titles)
- "layout": "table" | "flow" | "compare" | "values" | "code"
- Optional "desc": "1-2 concise definition lines with key terms"
- Optional "eq": "key raw LaTeX formula without delimiters, e.g. V_{th} = V_{oc}"
- Optional "example": "worked numerical or conceptual example starting with context, e.g. F = 100 N at 30° -> Fx = 86.6 N, Fy = 50 N"
- For "table": "rows": [["label", "raw LaTeX formula or concise rule"], ...4 to 8 rows]
- For "flow": "steps": ["step 1", "step 2", "step 3", ...4 to 8 rows] (derivations/process chips)
- For "compare": "left": "Topic A", "right": "Topic B", "rows": [["feature A", "feature B"], ...4 to 8 rows]
- For "values": "items": ["constant / condition 1", "unit 2", ...max 6]
- For "code": "code": "ANSI C snippet (max 6 lines)", "notes": ["key observation"]

MICRO-NOTE STYLE: High-yield fragments, never filler sentences. Abbreviations encouraged (w/, thru, b/w, ->, ↑ ↓, Δ, ∴, ∵, ≈, ∝, ≤ ≥ ≠).
HARD RULES:
- NO unbroken string longer than 22 characters.
- BANNED: trap, tip, trick, hack, warning, pitfall, remember, note, pro tip, keep in mind, watch out, common mistake, careful. ZERO advice boxes.
- Full syllabus coverage. Fit tightly into balanced cards.
REASONING: Keep reasoning concise and output the JSON directly.`;

    const payload = {
      model: getActiveAiModel(),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Generate the 1-page cheatsheet JSON for ${alias} Unit ${unitIdx + 1}. Full unit coverage, print-dense.` }
      ],
      stream: false,
      temperature: 0.2,
      max_tokens: 16000,
      reasoning: { effort: 'minimal' },
      reasoning_effort: 'minimal'
    };

    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' };
    let resp = null;
    let lastErr = null;
    // The server proxy injects the gateway key and pins the model.
    try {
      resp = await fetch(getActiveAiApiUrl(), {
        method: 'POST', headers, body: JSON.stringify(payload),
        signal
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      lastErr = e;
    }

    if (!resp || !resp.ok) {
      const errData = await resp?.json().catch(() => ({}));
      const sheetErr = errData?.error?.message || `AI synthesis error (${resp ? resp.status : 'offline'}) — please try again`;
      throw new Error(sheetErr);
    }
    const data = await resp.json();
    const raw = (data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '').trim();
    if (!raw) {
      if (data.choices?.[0]?.finish_reason === 'length') {
        throw new Error('Cheatsheet exceeded token capacity — please tap Regenerate');
      }
      throw new Error('Empty cheatsheet response — try again');
    }
    const doc = sheetParseDoc(raw);
    if (!doc) throw new Error(`Cheatsheet for Unit ${unitIdx + 1} came back garbled — try again`);
    return doc;
  }

  async function generateCheatsheet() {
    if (sheetBusy) return;
    const alias = sheetSubject ? sheetSubject.value : '';
    const unitVal = sheetUnit ? sheetUnit.value : '0';
    if (!alias) {
      showToast('Pick a subject and unit first.');
      return;
    }

    const isDuplex = unitVal.startsWith('duplex-');
    let uA = 0, uB = 1;
    if (isDuplex) {
      const parts = unitVal.replace('duplex-', '').split('-');
      uA = parseInt(parts[0], 10) || 0;
      uB = parseInt(parts[1], 10) || 1;
    } else {
      uA = parseInt(unitVal, 10) || 0;
    }

    sheetBusy = true;
    sheetAbort = new AbortController();
    if (sheetGenBtn) { sheetGenBtn.disabled = false; sheetGenBtn.textContent = '⏹ Stop generation'; }
    if (sheetStatus) {
      sheetStatus.style.display = 'inline-flex';
      sheetStatus.innerHTML = isDuplex
        ? `<span class="fc-stream-dot"></span><span>Forging 2-page Duplex ${escapeHtml(alias)} Units ${uA + 1} & ${uB + 1} cheatsheet…</span>`
        : `<span class="fc-stream-dot"></span><span>Forging 1-page ${escapeHtml(alias)} Unit ${uA + 1} cheatsheet…</span>`;
    }

    const userLine = isDuplex
      ? `📄 Cheatsheet: ${alias} · Duplex Units ${uA + 1} & ${uB + 1}`
      : `📄 Cheatsheet: ${alias} · Unit ${uA + 1}`;
    const userBubble = document.createElement('div');
    userBubble.className = 'ai-msg user';
    const userText = document.createElement('div');
    userText.textContent = userLine;
    userBubble.appendChild(userText);
    chatArea.appendChild(userBubble);

    const botMsg = document.createElement('div');
    botMsg.className = 'ai-msg bot cheatsheet-msg';
    chatArea.appendChild(botMsg);
    const loading = document.createElement('div');
    loading.className = 'ai-bot-content';
    loading.innerHTML = `<div class="sheet-forge"><div class="sheet-forge-page"><div class="sheet-forge-head"></div><div class="sheet-forge-lines"><span></span><span></span><span></span><span></span><span></span><span></span></div></div><div class="sheet-forge-text" id="sheetForgeStage">Reading syllabus & balancing columns…</div></div>`;
    botMsg.appendChild(loading);
    chatArea.scrollTop = chatArea.scrollHeight;

    const stages = isDuplex
      ? ['Reading Unit ' + (uA + 1) + ' & ' + (uB + 1) + ' syllabus…', 'Distilling formulas…', 'Optimizing 4-column bin packing…', 'Formatting duplex landscape geometry…', 'Fitting 297mm x 210mm layout…']
      : ['Reading unit syllabus…', 'Distilling formulas…', 'Compressing tables & examples…', 'Balancing 4 column bottoms…', 'Fitting A4 landscape…'];
    let stageIdx = 0;
    sheetForgeTimer = setInterval(() => {
      const el = document.getElementById('sheetForgeStage');
      if (!el) { stopSheetForge(); return; }
      stageIdx = (stageIdx + 1) % stages.length;
      el.textContent = stages[stageIdx];
    }, 1400);

    try {
      let sheetDOM = null;
      let sheetTitle = '';
      let unitClass = '';
      let docA = null;
      let docB = null;
      let singleDoc = null;

      if (isDuplex) {
        [docA, docB] = await Promise.all([
          fetchUnitCheatsheetDoc(alias, uA, sheetAbort.signal),
          fetchUnitCheatsheetDoc(alias, uB, sheetAbort.signal)
        ]);
        sheetDOM = buildDuplexSheetDOM(docA, docB, uA, uB, alias);
        sheetTitle = `${alias} Units ${uA + 1} & ${uB + 1} Duplex Cheatsheet`;
        unitClass = getUnitPaletteClass(uA);
      } else {
        singleDoc = await fetchUnitCheatsheetDoc(alias, uA, sheetAbort.signal);
        sheetDOM = buildSheetDOM(singleDoc, uA, alias);
        sheetTitle = `${alias} Unit ${uA + 1} Cheatsheet`;
        unitClass = getUnitPaletteClass(uA);
      }

      botMsg.innerHTML = '';
      stripAdviceNodes(sheetDOM);
      // Generate standalone print HTML blob for direct external viewing/download (zero in-app DOM clutter)
      const standaloneHTML = generateStandaloneSheetHTML(sheetDOM, sheetTitle, unitClass);
      const blob = new Blob([standaloneHTML], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(blob);

      // Set global active cheatsheet state for in-app pop-up and chat iteration
      window.activeCheatsheetState = {
        alias,
        title: sheetTitle,
        subtitle: isDuplex ? ('Units ' + (uA + 1) + ' & ' + (uB + 1)) : ('Unit ' + (uA + 1)),
        faculty: 'B.Tech IT · Semester 1',
        doc: isDuplex ? docA : singleDoc,
        sheetDOM: sheetDOM,
        html: standaloneHTML,
        pdfUrl: blobUrl,
        isDuplex,
        uA,
        uB,
        isMaster: false
      };

      let cardsDesc = '';
      const activeDoc = isDuplex ? docA : singleDoc;
      if (activeDoc && Array.isArray(activeDoc.boxes)) {
        cardsDesc = activeDoc.boxes.map((b, i) => `Card ${i + 1}: [${b.title}] (Layout: ${b.layout || 'standard'}) ${b.desc || ''} | Formula: ${b.eq || ''} | Ex: ${b.example || ''}`).join('\n');
      }

      chatHistory.push({
        role: 'assistant',
        content: `[ACTIVE CHEATSHEET GENERATED & LOADED IN POP-UP VIEWER: "${sheetTitle}"]\n` +
          `Subject: ${alias} · Coverage: ${isDuplex ? 'Duplex Units ' + (uA + 1) + ' & ' + (uB + 1) : 'Unit ' + (uA + 1)}\n` +
          (cardsDesc ? `Cards currently on sheet:\n${cardsDesc}\n\n` : '') +
          `[CHEATSHEET ITERATION MODE: The student is viewing this cheatsheet in the pop-up viewer. If the student asks to change, tweak, add, shorten, or iterate on cards or formulas, explain your changes concisely and include the updated JSON block: {"title": "${sheetTitle}", "boxes": [ ...updated cards... ]}. The app will automatically detect the updated JSON and refresh the cheatsheet in the pop-up viewer.]`
      });

      const exportCard = buildSheetExportCard({
        title: sheetTitle,
        subtitle: isDuplex ? ('Units ' + (uA + 1) + ' & ' + (uB + 1) + ' · Full Duplex Cheatsheet') : ('Unit ' + (uA + 1) + ' · Revision Cheatsheet'),
        faculty: 'B.Tech IT · Semester 1',
        badge: isDuplex ? '📄 40+ DENSE TOPIC CARDS · TWO-PAGE DUPLEX A4' : '📄 24 DENSE TOPIC CARDS · PRINT-READY A4',
        pdfUrl: blobUrl,
        sheetDOM: sheetDOM,
        html: standaloneHTML,
        filename: alias + '-' + (isDuplex ? ('u' + (uA + 1) + '-u' + (uB + 1)) : ('u' + (uA + 1))) + '-cheatsheet.html',
        isMaster: false
      });
      botMsg.appendChild(exportCard);
      chatArea.scrollTop = chatArea.scrollHeight;
      if (sheetStatus) sheetStatus.style.display = 'none';
      showToast(isDuplex ? '2-Page Duplex Cheatsheet ready! 📑' : '1-Page A4 Landscape Cheatsheet ready! 📄');

      // Auto-open in-app pop-up viewer so the student immediately inspects the generated cheatsheet full-screen!
      openCheatsheetPopUp({
        title: sheetTitle,
        subtitle: isDuplex ? ('Units ' + (uA + 1) + ' & ' + (uB + 1) + ' · Full Duplex Cheatsheet') : ('Unit ' + (uA + 1) + ' · Revision Cheatsheet'),
        faculty: 'B.Tech IT · Semester 1',
        badge: isDuplex ? '📄 40+ DENSE TOPIC CARDS · TWO-PAGE DUPLEX A4' : '📄 24 DENSE TOPIC CARDS · PRINT-READY A4',
        pdfUrl: blobUrl,
        sheetDOM: sheetDOM,
        html: standaloneHTML,
        filename: alias + '-' + (isDuplex ? ('u' + (uA + 1) + '-u' + (uB + 1)) : ('u' + (uA + 1))) + '-cheatsheet.html',
        isMaster: false
      });
    } catch (err) {
      console.error('Cheatsheet error:', err);
      if (err && err.name === 'AbortError') {
        try { botMsg.remove(); } catch (e) {}
        try { userBubble.remove(); } catch (e) {}
        if (sheetStatus) sheetStatus.style.display = 'none';
        showToast('Cheatsheet stopped.');
      } else {
        botMsg.innerHTML = '';
        const fail = document.createElement('div');
        fail.className = 'ai-bot-content';
        fail.textContent = `⚠️ ${err.message || 'Generation failed'} — try again.`;
        botMsg.appendChild(fail);
        if (sheetStatus) {
          sheetStatus.style.display = 'inline-flex';
          sheetStatus.innerHTML = `<span>⚠️ ${escapeHtml(err.message || 'Generation failed')} — try again.</span>`;
        }
        showToast(`Cheatsheet error: ${err.message || 'Generation issue'}`);
      }
    } finally {
      stopSheetForge();
      sheetBusy = false;
      sheetAbort = null;
      if (sheetGenBtn) { sheetGenBtn.disabled = false; sheetGenBtn.textContent = '⚡ Cheatsheet'; }
      chatArea.scrollTop = chatArea.scrollHeight;
    }
  }
  if (sheetGenBtn) sheetGenBtn.addEventListener('click', () => {
    if (sheetBusy) {
      if (sheetAbort) sheetAbort.abort();
    } else {
      generateCheatsheet();
    }
  });
  window.addEventListener('afterprint', () => {
    document.body.classList.remove('print-cheatsheet');
    const dup = document.querySelector('.duplex-sheet');
    if (dup) {
      const activeTab = dup.querySelector('.duplex-tab.active');
      const p1 = dup.querySelector('.duplex-page.page-1');
      const p2 = dup.querySelector('.duplex-page.page-2');
      if (activeTab && p1 && p2) {
        if (activeTab.textContent.includes('Page 1')) {
          p1.style.display = ''; p2.style.display = 'none';
        } else if (activeTab.textContent.includes('Page 2')) {
          p1.style.display = 'none'; p2.style.display = '';
        } else {
          p1.style.display = ''; p2.style.display = '';
        }
      }
    }
  });
}

// ─── AI Flashcards (Vercel AI Gateway · meta/muse-ember) ───
function initFlashcards() {
  const topicInput = document.getElementById('fcTopicInput');
  const generateBtn = document.getElementById('fcGenerateBtn');
  const modeSelect = document.getElementById('fcModeSelect');
  const countSelect = document.getElementById('fcCountSelect');
  const quickChips = document.getElementById('fcQuickChips');
  const deckArea = document.getElementById('fcDeckArea');
  let emptyState = document.getElementById('fcEmptyState');
  const controls = document.getElementById('fcControls');
  const prevBtn = document.getElementById('fcPrevBtn');
  const flipBtn = document.getElementById('fcFlipBtn');
  const shuffleBtn = document.getElementById('fcShuffleBtn');
  const nextBtn = document.getElementById('fcNextBtn');
  const counter = document.getElementById('fcCounter');
  const streamStatus = document.getElementById('fcStreamStatus');
  const deckList = document.getElementById('fcDeckList');
  const clearDecksBtn = document.getElementById('fcClearDecksBtn');
  const zoomBtn = document.getElementById('fcZoomBtn');
  const zoomModal = document.getElementById('fcZoomModal');
  const zoomBackdrop = document.getElementById('fcZoomBackdrop');
  const zoomViewport = document.getElementById('fcZoomCardViewport');
  const zoomCloseBtn = document.getElementById('fcZoomCloseBtn');
  const zoomFlipBtn = document.getElementById('fcZoomFlipBtn');
  const zoomPrevBtn = document.getElementById('fcZoomPrevBtn');
  const zoomNextBtn = document.getElementById('fcZoomNextBtn');
  const zoomCounter = document.getElementById('fcZoomCounter');

  const fcSubjectContext = document.getElementById('fcSubjectContext');
  const fcSubjBadge = document.getElementById('fcSubjBadge');
  const fcSubjTitle = document.getElementById('fcSubjTitle');
  const fcSubjMeta = document.getElementById('fcSubjMeta');

  // Single source of truth: derive flashcard/quiz metadata from syllabus.js.
  // (The old local FC_SUBJECTS drifted to 2025 codes and even the wrong PHL subject.)
  const FC_CONTEXT = {
    PPS: "ANSI C programming language, GCC compiler, stack/heap memory, pointer arithmetic, recursion stack frames & base conditions, dynamic memory allocation, data structures, and university end-sem exam conventions.",
    BEE: "Electric circuit theorems (Thevenin, Norton, Superposition, Maximum Power Transfer), mesh/nodal analysis, AC phasors, RLC resonance, and transformer calculations.",
    SMT: "Engineering mathematics, differential calculus, ODEs, matrix algebra (eigenvalues, Cayley-Hamilton), vector calculus (Green, Stokes, Gauss divergence theorems).",
    PHL: "Engineering Physics–I: crystallography, interference, diffraction, polarization, lasers, fiber optics, quantum mechanics, and semiconductor physics as per GGSIPU 2026 ICT-111T.",
    EM: "Engineering mechanics, free body diagrams, Varignon's theorem, method of joints/sections for trusses, friction laws, kinematics, and work-energy impulse-momentum principles.",
    CSL: "Communication skills: grammar, précis, paragraph writing, notices, minutes, memos, emails, phonetics, group discussion, and interview communication.",
    EVSL: "Environmental Studies: ecology, biodiversity, natural resources, pollution, e-waste, climate change, environmental legislation, EIA, and sustainable development.",
    PD: "Personality development: SWOT, time management, spoken communication, body language, presentations, résumé writing, group discussion, and interview skills.",
    EGL: "Engineering Graphics: lettering, points/lines/planes, projection of solids, CAD, isometric projection, and engineering drawing conventions (ETME-159 pattern).",
    "PPS Viva": "Practical C programming laboratory viva voce: pointers, segmentation faults, dynamic memory, linked lists, file I/O, gcc flags, and the 16 syllabus lab experiments.",
    "BEE Viva": "Practical electrical laboratory: KCL/KVL verification, Thevenin/Norton kits, 3-phase power, transformers, meter connections, oscilloscope calibration, and viva questions."
  };

  function buildFlashcardSubjects() {
    const out = {};
    const official = (typeof SF_SEM1_SUBJECTS !== 'undefined' && Array.isArray(SF_SEM1_SUBJECTS)) ? SF_SEM1_SUBJECTS : [];
    official.forEach((s) => {
      if (!s || !s.alias) return;
      const fac = (typeof SF_FACULTY !== 'undefined' && SF_FACULTY[s.alias]) ? (SF_FACULTY[s.alias].faculty || '') : '';
      const units = Array.isArray(s.units) ? s.units.join(' | ') : '';
      out[s.alias] = {
        alias: s.alias,
        code: s.code || s.alias,
        name: s.name || s.alias,
        faculty: fac || 'Faculty',
        units,
        meta: `${fac ? fac + ' · ' : ''}${s.name || s.alias} · Units I–IV`,
        context: FC_CONTEXT[s.alias] || `${s.name || s.alias}: ${units}`
      };
    });
    const ppsLab = (typeof SF_FACULTY !== 'undefined' && SF_FACULTY['PPS LAB']) ? SF_FACULTY['PPS LAB'] : {};
    const beeLab = (typeof SF_FACULTY !== 'undefined' && SF_FACULTY['BEE LAB']) ? SF_FACULTY['BEE LAB'] : {};
    out['PPS Viva'] = {
      alias: 'PPS Viva',
      code: ppsLab.code || 'ICT-151 / 101P',
      name: 'PPS Practical Lab & Viva Voce',
      faculty: ppsLab.faculty || 'Mr. Ankit Jain',
      units: '16 mandatory C lab experiments: pointers, segfaults, dynamic arrays, linked lists, file I/O',
      meta: `${ppsLab.faculty || 'Mr. Ankit Jain'} · 16 Lab Experiments · Viva Voce`,
      context: FC_CONTEXT['PPS Viva']
    };
    out['BEE Viva'] = {
      alias: 'BEE Viva',
      code: beeLab.code || 'ICT-103P / ICT-106P',
      name: 'BEE Practical Lab & Viva Voce',
      faculty: beeLab.faculty || 'Ms. Pooja',
      units: '10 mandatory experiments: KCL/KVL verification, Thevenin/Norton, 3-phase power, transformers',
      meta: `${beeLab.faculty || 'Ms. Pooja'} · 10 Lab Experiments · Meter Connections & Viva`,
      context: FC_CONTEXT['BEE Viva']
    };
    out.GEN = {
      alias: 'General',
      code: '—',
      name: 'General Engineering & Science',
      faculty: '',
      units: 'Topic-driven; no single subject code',
      meta: 'Topic-driven · General revision',
      context: 'General engineering and science. No specific GGSIPU subject code was detected from the input.'
    };
    return out;
  }

  const FC_SUBJECTS = buildFlashcardSubjects();

  function resolveSubject(str) {
    const key = String(str || '').trim().toUpperCase();
    if (!key) return FC_SUBJECTS.PPS || FC_SUBJECTS.GEN;
    if (key.includes('PPS VIVA') || key.includes('PPS LAB')) return FC_SUBJECTS['PPS Viva'];
    if (key.includes('BEE VIVA') || key.includes('BEE LAB')) return FC_SUBJECTS['BEE Viva'];
    const ordered = ['PPS', 'BEE', 'SMT', 'PHL', 'EM', 'CSL', 'EVSL', 'PD', 'EGL'];
    for (const alias of ordered) {
      const s = FC_SUBJECTS[alias];
      if (!s) continue;
      const ab = alias.toUpperCase();
      const name = String(s.name || '').toUpperCase();
      const code = String(s.code || '').toUpperCase();
      if (key === ab || key.startsWith(ab + ':') || key.startsWith(ab + ' ') ||
          (name && key.includes(name)) || (code && code !== '—' && key.includes(code))) {
        return s;
      }
    }
    if (/\bEVS\b|ENVIRONMENT/.test(key)) return FC_SUBJECTS.EVSL;
    if (/PHYSICS|SEMICONDUCTOR/.test(key)) return FC_SUBJECTS.PHL;
    if (/MATH|MODELING|MATRICES/.test(key)) return FC_SUBJECTS.SMT;
    if (/ELECTRICAL|CIRCUIT/.test(key)) return FC_SUBJECTS.BEE;
    if (/MECHANIC|STATICS|DYNAMICS/.test(key)) return FC_SUBJECTS.EM;
    if (/COMMUNICATION|ENGLISH|GRAMMAR/.test(key)) return FC_SUBJECTS.CSL;
    if (/GRAPHICS|DRAWING|CAD/.test(key)) return FC_SUBJECTS.EGL;
    if (/PERSONALITY|SOFT SKILLS|INTERVIEW/.test(key)) return FC_SUBJECTS.PD;
    return FC_SUBJECTS.GEN;
  }

  function updateSubjectContextBadge(subjKey) {
    const data = resolveSubject(subjKey);
    if (fcSubjBadge) fcSubjBadge.textContent = `${data.alias} · ${data.code}`;
    if (fcSubjTitle) fcSubjTitle.textContent = data.name;
    if (fcSubjMeta) fcSubjMeta.textContent = data.meta;
    if (fcSubjectContext) fcSubjectContext.style.display = 'flex';
    return data;
  }

  let currentCards = [];
  let currentIndex = 0;
  let currentGenerationId = 0;
  let flashAbort = null;
  let flashBusy = false;
  const FC_STORAGE = 'studyForge_flashcards';

  function loadDecks() {
    try { return JSON.parse(localStorage.getItem(FC_STORAGE)) || []; }
    catch { return []; }
  }
  function saveDecks(decks) {
    try {
      localStorage.setItem(FC_STORAGE, JSON.stringify(decks));
    } catch (e) {
      console.warn('Flashcard deck save failed:', e);
      showToast('Could not save deck — storage full. Delete old decks.');
    }
  }

  function normalizeCard(c, topic, defaultSubjAlias = 'StudyForged') {
    let tag = c.tag;
    if (!tag) {
      tag = defaultSubjAlias ? `${defaultSubjAlias} · Core Concept` : (topic.split(':')[0] || 'StudyForged');
    }
    return {
      title: c.title || c.q || 'Key Concept',
      tag: tag,
      difficulty: c.difficulty || 'High-Yield',
      essence: c.essence || c.q || '',
      visual: c.visual || '',
      takeaways: Array.isArray(c.takeaways) && c.takeaways.length ? c.takeaways : (c.q ? [c.q] : []),
      steps: Array.isArray(c.steps) && c.steps.length ? c.steps : (c.a ? [c.a] : []),
      examTrap: c.examTrap || c.tip || '',
      mnemonic: c.mnemonic || '',
      q: c.q || c.title || 'Key Concept',
      a: c.a || (Array.isArray(c.steps) ? c.steps.join('\n') : ''),
      tip: c.tip || c.examTrap || ''
    };
  }

  function renderVisualContent(container, content) {
    if (!content) return;
    const str = String(content).trim();
    // If content contains an SVG diagram
    if (str.includes('<svg') && str.includes('</svg>')) {
      const svgMatch = str.match(/<svg[\s\S]*?<\/svg>/i);
      if (svgMatch) {
        try {
          const parser = new DOMParser();
          let svgDoc = parser.parseFromString(svgMatch[0], 'image/svg+xml');
          let svgEl = svgDoc.querySelector('svg');
          // Forgiving HTML parser fallback for unescaped & or < entities in SVG text
          if (!svgEl || svgDoc.querySelector('parsererror')) {
            const htmlDoc = parser.parseFromString(svgMatch[0], 'text/html');
            svgEl = htmlDoc.querySelector('svg');
          }
          if (svgEl) {
            // Sanitize: strip script tags and any on* attributes
            svgEl.querySelectorAll('script').forEach(s => s.remove());
            const allEls = [svgEl, ...svgEl.querySelectorAll('*')];
            allEls.forEach(el => {
              for (let i = el.attributes.length - 1; i >= 0; i--) {
                const attr = el.attributes[i];
                if (attr.name.toLowerCase().startsWith('on') || attr.value.toLowerCase().includes('javascript:')) {
                  el.removeAttribute(attr.name);
                }
              }
            });
            if (!svgEl.getAttribute('width')) svgEl.setAttribute('width', '100%');
            svgEl.style.maxWidth = '100%';
            svgEl.style.height = 'auto';
            svgEl.style.display = 'block';
            svgEl.style.margin = '0 auto';
            container.appendChild(document.adoptNode(svgEl));
            return;
          }
        } catch (e) {
          console.warn('SVG parse fallback:', e);
        }
      }
    }
    // If content was supposed to be SVG but failed, never dump raw code string
    if (str.startsWith('<svg') || str.includes('</svg>')) {
      container.innerHTML = '<div style="font-size:12px;opacity:0.8;font-weight:600;padding:8px 0;">⚡ Visual Schematic Blueprint</div>';
      return;
    }
    // Otherwise render via mdToHtml (handles KaTeX math display blocks, code blocks, etc.)
    container.innerHTML = mdToHtml(str);
  }

  function createCardDOM(card, isZoom = false) {
    const cardEl = document.createElement("div");
    cardEl.className = "fc-card";
    if (isZoom) cardEl.classList.add("fc-card-zoomed");

    const inner = document.createElement("div");
    inner.className = "fc-card-inner";

    // ── FRONT: Visual Cheat-Sheet Note ──
    const front = document.createElement("div");
    front.className = "fc-card-front";

    const frontMeta = document.createElement("div");
    frontMeta.className = "fc-card-meta";

    const tagSpan = document.createElement("span");
    tagSpan.className = "fc-card-tag";
    tagSpan.textContent = card.tag || 'StudyForged Concept';
    frontMeta.appendChild(tagSpan);

    const diffSpan = document.createElement("span");
    const diffText = card.difficulty || 'High-Yield';
    const dLower = String(diffText).toLowerCase();
    let dClass = 'fc-diff-highyield';
    if (dLower.includes('easy')) dClass = 'fc-diff-easy';
    else if (dLower.includes('med')) dClass = 'fc-diff-medium';
    diffSpan.className = `fc-card-diff ${dClass}`;
    diffSpan.textContent = diffText;
    frontMeta.appendChild(diffSpan);
    front.appendChild(frontMeta);

    const frontBody = document.createElement("div");
    frontBody.className = "fc-card-body";

    // If new Visual Study Card format:
    if (card.title) {
      const titleEl = document.createElement("h3");
      titleEl.className = "fc-card-title";
      titleEl.textContent = card.title;
      frontBody.appendChild(titleEl);

      if (card.essence) {
        const essenceEl = document.createElement("div");
        essenceEl.className = "fc-card-essence";
        essenceEl.innerHTML = mdToHtml(card.essence);
        frontBody.appendChild(essenceEl);
      }

      if (card.visual) {
        const visualBox = document.createElement("div");
        visualBox.className = "fc-visual-box";
        renderVisualContent(visualBox, card.visual);
        frontBody.appendChild(visualBox);
      }

      if (Array.isArray(card.takeaways) && card.takeaways.length) {
        const takeawaysList = document.createElement("div");
        takeawaysList.className = "fc-takeaways";
        card.takeaways.forEach(item => {
          const row = document.createElement("div");
          row.className = "fc-takeaway-item";
          const chev = document.createElement("span");
          chev.className = "fc-takeaway-chevron";
          chev.textContent = "▸";
          const textSpan = document.createElement("span");
          textSpan.innerHTML = mdToHtml(String(item));
          row.append(chev, textSpan);
          takeawaysList.appendChild(row);
        });
        frontBody.appendChild(takeawaysList);
      }
    } else {
      // Backward compatibility with legacy { q, a }
      const legacyQ = document.createElement("div");
      legacyQ.innerHTML = mdToHtml(String(card.q == null ? "" : card.q));
      frontBody.appendChild(legacyQ);
    }
    front.appendChild(frontBody);

    // ── BACK: Mastery Deep-Dive & Traps ──
    const back = document.createElement("div");
    back.className = "fc-card-back";

    const backMeta = document.createElement("div");
    backMeta.className = "fc-card-meta";
    const backLabel = document.createElement("span");
    backLabel.className = "fc-card-label";
    backLabel.textContent = "🧠 Mastery Breakdown & Traps";
    backMeta.appendChild(backLabel);
    back.appendChild(backMeta);

    const backBody = document.createElement("div");
    backBody.className = "fc-card-body";

    if (card.title) {
      const backTitle = document.createElement("h4");
      backTitle.className = "fc-card-title";
      backTitle.textContent = `${card.title} — Procedure & Intel`;
      backBody.appendChild(backTitle);

      if (Array.isArray(card.steps) && card.steps.length) {
        const stepsList = document.createElement("div");
        stepsList.className = "fc-back-steps";
        card.steps.forEach((step, idx) => {
          const stepRow = document.createElement("div");
          stepRow.className = "fc-back-step";
          const numSpan = document.createElement("span");
          numSpan.className = "fc-step-num";
          numSpan.textContent = String(idx + 1);
          const stepText = document.createElement("span");
          stepText.className = "fc-step-text";
          stepText.innerHTML = mdToHtml(String(step));
          stepRow.append(numSpan, stepText);
          stepsList.appendChild(stepRow);
        });
        backBody.appendChild(stepsList);
      }

      if (card.examTrap) {
        const trapBox = document.createElement("div");
        trapBox.className = "fc-back-trap";
        trapBox.innerHTML = `<div class="fc-trap-title">⚠️ Common Exam Trap:</div><div>${mdToHtml(String(card.examTrap))}</div>`;
        backBody.appendChild(trapBox);
      }

      if (card.mnemonic) {
        const mnemBox = document.createElement("div");
        mnemBox.className = "fc-back-mnemonic";
        mnemBox.innerHTML = `💡 <strong>Memory Hook:</strong> ${mdToHtml(String(card.mnemonic))}`;
        backBody.appendChild(mnemBox);
      }
    } else {
      // Backward compatibility with legacy { q, a, tip }
      const legacyA = document.createElement("div");
      legacyA.innerHTML = mdToHtml(String(card.a == null ? "" : card.a));
      backBody.appendChild(legacyA);
      if (card.tip) {
        const tipBox = document.createElement("div");
        tipBox.className = "fc-card-tip";
        tipBox.innerHTML = `<strong>💡 Exam Intel / Trap:</strong> ${mdToHtml(String(card.tip))}`;
        backBody.appendChild(tipBox);
      }
    }
    back.appendChild(backBody);

    inner.append(front, back);
    cardEl.append(inner);

    if (!isZoom) {
      const hint = document.createElement("span");
      hint.className = "fc-tap-hint";
      hint.innerHTML = '<span>↔ Swipe left / right</span> • <span>Tap to flip 🔄</span> • <span>Hold to zoom 🔍</span>';
      cardEl.append(hint);
    }

    return cardEl;
  }

  function openCardZoom(index) {
    if (!currentCards.length) {
      showToast('No cards to zoom yet.');
      return;
    }
    const idx = (typeof index === 'number' && index >= 0 && index < currentCards.length) ? index : currentIndex;
    const isCurrentlyFlipped = !!(document.getElementById('fcCard')?.classList.contains('flipped'));
    if (zoomModal) {
      zoomModal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      renderZoomCard(idx);
      if (isCurrentlyFlipped) {
        const zCard = document.getElementById('fcZoomCard');
        if (zCard) zCard.classList.add('flipped');
      }
    }
  }

  function closeCardZoom() {
    if (zoomModal) {
      const isZoomFlipped = !!(document.getElementById('fcZoomCard')?.classList.contains('flipped'));
      zoomModal.style.display = 'none';
      document.body.style.overflow = '';
      renderCard(currentIndex);
      if (isZoomFlipped) {
        const normCard = document.getElementById('fcCard');
        if (normCard) normCard.classList.add('flipped');
      }
    }
  }

  function renderZoomCard(index, slideDirection = null) {
    if (!currentCards.length || !zoomViewport) return;
    if (index < 0) index = 0;
    if (index >= currentCards.length) index = currentCards.length - 1;
    currentIndex = index;
    const card = currentCards[index];

    zoomViewport.innerHTML = "";
    const cardEl = createCardDOM(card, true);
    cardEl.id = "fcZoomCard";
    if (slideDirection === 'next') {
      cardEl.classList.add('fc-slide-in-right');
    } else if (slideDirection === 'prev') {
      cardEl.classList.add('fc-slide-in-left');
    }

    // Swipe navigation inside zoom view
    let startX = 0;
    let startY = 0;
    let currentDeltaX = 0;
    let startTime = 0;
    let isTracking = false;
    let isDragging = false;
    let isDirectionLocked = false;
    let isVerticalScroll = false;
    let wasSwipeGesture = false;

    function onZoomStart(clientX, clientY) {
      isTracking = true;
      isDragging = false;
      isDirectionLocked = false;
      isVerticalScroll = false;
      wasSwipeGesture = false;
      startX = clientX;
      startY = clientY;
      currentDeltaX = 0;
      startTime = Date.now();
      cardEl.classList.remove('fc-swipe-snap-back', 'fc-slide-in-right', 'fc-slide-in-left');
      cardEl.style.transition = 'none';
    }

    function onZoomMove(clientX, clientY, e) {
      if (!isTracking || isVerticalScroll) return;
      const deltaX = clientX - startX;
      const deltaY = clientY - startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (!isDirectionLocked && (absX > 8 || absY > 8)) {
        isDirectionLocked = true;
        if (absY > absX * 1.3) {
          isVerticalScroll = true;
          return;
        } else {
          isDragging = true;
          wasSwipeGesture = true;
          cardEl.classList.add('fc-swiping');
        }
      }

      if (isDragging) {
        if (e && e.cancelable && typeof e.preventDefault === 'function') {
          e.preventDefault();
        }
        currentDeltaX = deltaX;
        const tilt = deltaX * 0.03;
        const opacity = Math.max(0.7, 1 - absX / 750);
        cardEl.style.transform = `translate3d(${deltaX}px, 0, 0) rotate(${tilt}deg)`;
        cardEl.style.opacity = String(opacity);
      }
    }

    function onZoomEnd() {
      if (!isTracking) return;
      isTracking = false;
      cardEl.classList.remove('fc-swiping');

      if (!isDragging) {
        cardEl.style.transform = '';
        cardEl.style.opacity = '';
        cardEl.style.transition = '';
        return;
      }

      isDragging = false;
      const timeElapsed = Math.max(Date.now() - startTime, 1);
      const velocity = Math.abs(currentDeltaX) / timeElapsed;
      const isTriggered = Math.abs(currentDeltaX) > 38 || (velocity > 0.22 && Math.abs(currentDeltaX) > 18);
      const isSwipeLeft = currentDeltaX < 0 && isTriggered;
      const isSwipeRight = currentDeltaX > 0 && isTriggered;

      if (isSwipeLeft) {
        if (currentIndex < currentCards.length - 1) {
          cardEl.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.2s ease-out';
          cardEl.style.transform = 'translate3d(-125%, 0, 0) rotate(-9deg)';
          cardEl.style.opacity = '0';
          setTimeout(() => { renderZoomCard(currentIndex + 1, 'next'); }, 210);
        } else {
          cardEl.style.transition = 'transform 0.28s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.2s ease';
          cardEl.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
          cardEl.style.opacity = '1';
          setTimeout(() => { cardEl.style.transition = ''; }, 300);
          showToast('You are on the last card! 🔥');
        }
        return;
      }

      if (isSwipeRight) {
        if (currentIndex > 0) {
          cardEl.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.2s ease-out';
          cardEl.style.transform = 'translate3d(125%, 0, 0) rotate(9deg)';
          cardEl.style.opacity = '0';
          setTimeout(() => { renderZoomCard(currentIndex - 1, 'prev'); }, 210);
        } else {
          cardEl.style.transition = 'transform 0.28s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.2s ease';
          cardEl.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
          cardEl.style.opacity = '1';
          setTimeout(() => { cardEl.style.transition = ''; }, 300);
          showToast('You are on the first card!');
        }
        return;
      }

      cardEl.style.transition = 'transform 0.28s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.2s ease';
      cardEl.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
      cardEl.style.opacity = '1';
      setTimeout(() => { cardEl.style.transition = ''; }, 300);
    }

    cardEl.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (e.target.closest('button, a, input, select, textarea')) return;
      onZoomStart(touch.clientX, touch.clientY);
    }, { passive: true });

    cardEl.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      onZoomMove(touch.clientX, touch.clientY, e);
    }, { passive: false });

    cardEl.addEventListener('touchend', onZoomEnd, { passive: true });
    cardEl.addEventListener('touchcancel', onZoomEnd, { passive: true });

    cardEl.addEventListener('click', (e) => {
      if (wasSwipeGesture) {
        wasSwipeGesture = false;
        e.stopPropagation();
        return;
      }
      cardEl.classList.toggle('flipped');
    });

    zoomViewport.appendChild(cardEl);

    if (zoomCounter) zoomCounter.textContent = `${index + 1} / ${currentCards.length}`;
    const zoomTag = document.getElementById('fcZoomTag');
    if (zoomTag) {
      zoomTag.textContent = card.tag || '⚡ STUDYFORGED FOCUS';
    }
    if (zoomPrevBtn) zoomPrevBtn.disabled = index === 0;
    if (zoomNextBtn) zoomNextBtn.disabled = index === currentCards.length - 1;

    // Keep background deck controls synced
    counter.textContent = `${index + 1} / ${currentCards.length}`;
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === currentCards.length - 1;
  }

  function renderCard(index, slideDirection = null) {
    if (!currentCards.length) return;
    currentIndex = index;
    const card = currentCards[index];
    deckArea.innerHTML = "";

    const cardEl = createCardDOM(card, false);
    if (slideDirection === 'next') {
      cardEl.classList.add('fc-slide-in-right');
    } else if (slideDirection === 'prev') {
      cardEl.classList.add('fc-slide-in-left');
    }
    cardEl.id = "fcCard";

    deckArea.appendChild(cardEl);

    // ── Rock-Solid Touch & Pointer Mobile Swipe Engine with Hold-to-Zoom ──
    let startX = 0;
    let startY = 0;
    let currentDeltaX = 0;
    let startTime = 0;
    let isTracking = false;
    let isDragging = false;
    let isDirectionLocked = false;
    let isVerticalScroll = false;
    let wasSwipeGesture = false;

    // Long-press hold-to-zoom timer (480ms)
    let holdZoomTimer = null;
    let holdZoomTriggered = false;

    function startHoldTimer() {
      clearHoldTimer();
      holdZoomTriggered = false;
      holdZoomTimer = setTimeout(() => {
        holdZoomTriggered = true;
        setTimeout(() => { holdZoomTriggered = false; }, 400);
        if (typeof holdClearTimer === 'function') holdClearTimer();
        if (window.navigator && window.navigator.vibrate) {
          try { window.navigator.vibrate(40); } catch (err) {}
        }
        openCardZoom(currentIndex);
      }, 480);
    }

    function clearHoldTimer() {
      if (holdZoomTimer) {
        clearTimeout(holdZoomTimer);
        holdZoomTimer = null;
      }
    }

    function onGestureStart(clientX, clientY) {
      isTracking = true;
      isDragging = false;
      isDirectionLocked = false;
      isVerticalScroll = false;
      wasSwipeGesture = false;
      startX = clientX;
      startY = clientY;
      currentDeltaX = 0;
      startTime = Date.now();
      cardEl.classList.remove('fc-swipe-snap-back', 'fc-slide-in-right', 'fc-slide-in-left');
      cardEl.style.transition = 'none';
      startHoldTimer();
    }

    function onGestureMove(clientX, clientY, e) {
      if (!isTracking) return;

      const deltaX = clientX - startX;
      const deltaY = clientY - startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // Cancel hold timer immediately if movement exceeds 8px in any direction
      if (absX > 8 || absY > 8) {
        clearHoldTimer();
      }

      if (isVerticalScroll) return;

      // Determine intent once movement exceeds 8px threshold
      if (!isDirectionLocked && (absX > 8 || absY > 8)) {
        isDirectionLocked = true;
        // If movement is predominantly vertical, let native card internal scrolling happen
        if (absY > absX * 1.3) {
          isVerticalScroll = true;
          return;
        } else {
          // It is a deliberate horizontal swipe gesture!
          isDragging = true;
          wasSwipeGesture = true;
          cardEl.classList.add('fc-swiping');
        }
      }

      if (isDragging) {
        // Prevent browser back/forward navigation and outer page scrolling
        if (e && e.cancelable && typeof e.preventDefault === 'function') {
          e.preventDefault();
        }
        currentDeltaX = deltaX;
        const tilt = deltaX * 0.035; // Natural subtle 1-3deg tilt
        const opacity = Math.max(0.68, 1 - absX / 750);
        cardEl.style.transform = `translate3d(${deltaX}px, 0, 0) rotate(${tilt}deg)`;
        cardEl.style.opacity = String(opacity);
      }
    }

    function onGestureEnd() {
      clearHoldTimer();
      if (!isTracking) return;
      isTracking = false;
      cardEl.classList.remove('fc-swiping');

      if (!isDragging) {
        cardEl.style.transform = '';
        cardEl.style.opacity = '';
        cardEl.style.transition = '';
        return;
      }

      isDragging = false;
      const timeElapsed = Math.max(Date.now() - startTime, 1);
      const velocity = Math.abs(currentDeltaX) / timeElapsed; // px/ms
      // Responsive trigger: flick at >0.22 px/ms OR dragged >38px
      const isTriggered = Math.abs(currentDeltaX) > 38 || (velocity > 0.22 && Math.abs(currentDeltaX) > 18);
      const isSwipeLeft = currentDeltaX < 0 && isTriggered;
      const isSwipeRight = currentDeltaX > 0 && isTriggered;

      // Swipe Left -> Next Card
      if (isSwipeLeft) {
        if (currentIndex < currentCards.length - 1) {
          cardEl.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.2s ease-out';
          cardEl.style.transform = 'translate3d(-125%, 0, 0) rotate(-9deg)';
          cardEl.style.opacity = '0';
          setTimeout(() => {
            renderCard(currentIndex + 1, 'next');
          }, 210);
        } else {
          cardEl.style.transition = 'transform 0.28s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.2s ease';
          cardEl.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
          cardEl.style.opacity = '1';
          setTimeout(() => {
            cardEl.style.transition = '';
          }, 300);
          showToast('You are on the last card! 🔥');
        }
        return;
      }

      // Swipe Right -> Previous Card
      if (isSwipeRight) {
        if (currentIndex > 0) {
          cardEl.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.2s ease-out';
          cardEl.style.transform = 'translate3d(125%, 0, 0) rotate(9deg)';
          cardEl.style.opacity = '0';
          setTimeout(() => {
            renderCard(currentIndex - 1, 'prev');
          }, 210);
        } else {
          cardEl.style.transition = 'transform 0.28s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.2s ease';
          cardEl.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
          cardEl.style.opacity = '1';
          setTimeout(() => {
            cardEl.style.transition = '';
          }, 300);
          showToast('You are on the first card!');
        }
        return;
      }

      // Sub-threshold drag: spring snap-back to center
      cardEl.style.transition = 'transform 0.28s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.2s ease';
      cardEl.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
      cardEl.style.opacity = '1';
      setTimeout(() => {
        cardEl.style.transition = '';
      }, 300);
    }

    // 1. Native Mobile Touch Events
    cardEl.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (e.target.closest('button, a, input, select, textarea')) return;
      if (window.getSelection && window.getSelection().toString().length > 0) return;
      onGestureStart(touch.clientX, touch.clientY);
    }, { passive: true });

    cardEl.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      onGestureMove(touch.clientX, touch.clientY, e);
    }, { passive: false });

    cardEl.addEventListener('touchend', () => {
      onGestureEnd();
    }, { passive: true });

    cardEl.addEventListener('touchcancel', () => {
      onGestureEnd();
    }, { passive: true });

    // 2. Pointer Events (Desktop Mouse & Pen Navigation)
    cardEl.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.target.closest('button, a, input, select, textarea')) return;
      if (window.getSelection && window.getSelection().toString().length > 0) return;
      onGestureStart(e.clientX, e.clientY);
      try { cardEl.setPointerCapture(e.pointerId); } catch (err) {}
    });

    cardEl.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      onGestureMove(e.clientX, e.clientY, e);
    });

    const finishPointer = (e) => {
      if (e.pointerType === 'touch') return;
      if (e && e.pointerId) {
        try { cardEl.releasePointerCapture(e.pointerId); } catch (err) {}
      }
      onGestureEnd();
    };
    cardEl.addEventListener('pointerup', finishPointer);
    cardEl.addEventListener('pointercancel', finishPointer);

    // Tap to flip (unless swiping, text selecting, or hold-to-zoom fired)
    cardEl.addEventListener('click', (e) => {
      clearHoldTimer();
      if (holdZoomTriggered) {
        holdZoomTriggered = false;
        e.stopPropagation();
        return;
      }
      if (wasSwipeGesture) {
        wasSwipeGesture = false;
        e.stopPropagation();
        return;
      }
      if (window.getSelection && window.getSelection().toString().length > 0) return;
      cardEl.classList.toggle('flipped');
    });

    counter.textContent = `${index + 1} / ${currentCards.length}`;
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === currentCards.length - 1;
  }

  function showCards(cards) {
    currentCards = cards;
    currentIndex = 0;
    if (emptyState) emptyState.style.display = 'none';
    if (streamStatus) streamStatus.style.display = 'none';
    controls.style.display = 'flex';
    renderCard(0);
  }

  // Navigation & Flip buttons
  prevBtn.addEventListener('click', () => {
    if (currentIndex > 0) renderCard(currentIndex - 1, 'prev');
  });
  nextBtn.addEventListener('click', () => {
    if (currentIndex < currentCards.length - 1) renderCard(currentIndex + 1, 'next');
  });
  if (flipBtn) {
    flipBtn.addEventListener('click', () => {
      const cardEl = document.getElementById('fcCard');
      if (cardEl) cardEl.classList.toggle('flipped');
    });
  }
  if (shuffleBtn) {
    shuffleBtn.addEventListener('click', () => {
      if (currentCards.length <= 1) return;
      for (let i = currentCards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [currentCards[i], currentCards[j]] = [currentCards[j], currentCards[i]];
      }
      renderCard(0);
      showToast('Deck shuffled! 🔀');
    });
  }

  // Dedicated Zoom button & Lightbox Controls
  if (zoomBtn) {
    zoomBtn.addEventListener('click', () => {
      openCardZoom(currentIndex);
    });
  }
  if (zoomCloseBtn) {
    zoomCloseBtn.addEventListener('click', closeCardZoom);
  }
  if (zoomBackdrop) {
    zoomBackdrop.addEventListener('click', closeCardZoom);
  }
  if (zoomFlipBtn) {
    zoomFlipBtn.addEventListener('click', () => {
      const zCard = document.getElementById('fcZoomCard');
      if (zCard) zCard.classList.toggle('flipped');
    });
  }
  if (zoomPrevBtn) {
    zoomPrevBtn.addEventListener('click', () => {
      if (currentIndex > 0) renderZoomCard(currentIndex - 1, 'prev');
    });
  }
  if (zoomNextBtn) {
    zoomNextBtn.addEventListener('click', () => {
      if (currentIndex < currentCards.length - 1) renderZoomCard(currentIndex + 1, 'next');
    });
  }

  // Keyboard Arrow Left/Right Navigation, Spacebar Flip, and Escape for Zoom
  document.addEventListener('keydown', (e) => {
    if (zoomModal && zoomModal.style.display === 'flex') {
      if (e.key === 'Escape') {
        closeCardZoom();
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowRight') {
        if (currentIndex < currentCards.length - 1) renderZoomCard(currentIndex + 1, 'next');
        e.preventDefault();
        return;
      } else if (e.key === 'ArrowLeft') {
        if (currentIndex > 0) renderZoomCard(currentIndex - 1, 'prev');
        e.preventDefault();
        return;
      } else if (e.key === ' ' || e.key === 'Enter') {
        const zCard = document.getElementById('fcZoomCard');
        if (zCard) zCard.classList.toggle('flipped');
        e.preventDefault();
        return;
      }
    }

    if (!currentCards.length) return;
    const cardEl = document.getElementById('fcCard');
    if (!cardEl || !cardEl.offsetParent) return;
    if (e.target.closest('input, textarea, select')) return;

    if (e.key === 'ArrowRight') {
      if (currentIndex < currentCards.length - 1) {
        renderCard(currentIndex + 1, 'next');
      }
    } else if (e.key === 'ArrowLeft') {
      if (currentIndex > 0) {
        renderCard(currentIndex - 1, 'prev');
      }
    } else if (e.key === ' ' || e.key === 'Enter') {
      cardEl.classList.toggle('flipped');
      e.preventDefault();
    }
  });

  // Quick subject chips — select subject, set prefix, and focus input without auto-generating
  if (quickChips) {
    quickChips.querySelectorAll('.fc-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        // Toggle active styling
        quickChips.querySelectorAll('.fc-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        const subj = chip.dataset.subject || (chip.dataset.topic ? chip.dataset.topic.split(':')[0].trim() : '');
        const example = chip.dataset.example || '';
        const mode = chip.dataset.mode;

        if (mode && modeSelect) modeSelect.value = mode;

        updateSubjectContextBadge(subj);

        if (topicInput) {
          topicInput.value = subj ? `${subj}: ` : '';
          if (example) {
            topicInput.placeholder = `e.g. ${example}...`;
          }
          topicInput.focus();
          const len = topicInput.value.length;
          topicInput.setSelectionRange(len, len);
        }
      });
    });
  }

  // Clear decks button
  if (clearDecksBtn) {
    clearDecksBtn.addEventListener('click', () => {
      const decks = loadDecks();
      if (!decks.length) {
        showToast('No saved decks to clear.');
        return;
      }
      if (confirm('Are you sure you want to clear all saved flashcard decks?')) {
        saveDecks([]);
        renderDeckList();
        currentCards = [];
        if (streamStatus) streamStatus.style.display = 'none';
        deckArea.innerHTML = `
          <div class="fc-empty-state" id="fcEmptyState">
            <span class="fc-empty-icon">🎴</span>
            <p>Pick a subject chip above or enter any topic, choose your focus mode, and hit Generate!</p>
          </div>
        `;
        emptyState = deckArea.querySelector('#fcEmptyState');
        controls.style.display = 'none';
        showToast('All saved decks cleared.');
      }
    });
  }

  function renderDeckList() {
    const decks = loadDecks();
    deckList.innerHTML = "";
    if (!decks.length) {
      const p = document.createElement("p");
      p.className = "fc-no-decks";
      p.textContent = "No saved decks yet.";
      deckList.appendChild(p);
      return;
    }
    decks.forEach((d, i) => {
      const row = document.createElement("div");
      row.className = "fc-deck-item";
      const open = document.createElement("button");
      open.className = "fc-deck-btn";
      open.dataset.index = String(i);
      const name = document.createElement("span");
      name.className = "fc-deck-name";
      name.textContent = String(d.topic == null ? "Untitled" : d.topic);
      const count = document.createElement("span");
      count.className = "fc-deck-count";
      count.textContent = `${Array.isArray(d.cards) ? d.cards.length : 0} cards`;
      open.append(name, count);
      const del = document.createElement("button");
      del.className = "fc-deck-delete";
      del.dataset.index = String(i);
      del.title = "Delete deck";
      del.textContent = "✕";
      row.append(open, del);
      deckList.appendChild(row);
    });

    deckList.querySelectorAll('.fc-deck-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const deck = decks[Number(btn.dataset.index)];
        if (deck && Array.isArray(deck.cards) && deck.cards.length) {
          showCards(deck.cards);
          if (topicInput) topicInput.value = deck.topic || '';
          if (deck.mode && modeSelect) modeSelect.value = deck.mode;
          if (deck.subject || deck.topic) updateSubjectContextBadge(deck.subject || deck.topic);
          showToast(`Loaded: ${deck.topic}`);
        }
      });
    });
    deckList.querySelectorAll('.fc-deck-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.index);
        decks.splice(idx, 1);
        saveDecks(decks);
        renderDeckList();
        showToast('Deck deleted.');
      });
    });
  }

  // Extract complete { ... } JSON objects from an accumulating stream of a JSON array
  function extractCompleteObjects(streamText) {
    const objects = [];
    let inString = false;
    let escaped = false;
    let braceDepth = 0;
    let objStart = -1;

    for (let i = 0; i < streamText.length; i++) {
      const c = streamText[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (c === '\\') {
          escaped = true;
        } else if (c === '"') {
          inString = false;
        }
      } else {
        if (c === '"') {
          inString = true;
        } else if (c === '{') {
          if (braceDepth === 0) objStart = i;
          braceDepth++;
        } else if (c === '}') {
          braceDepth--;
          if (braceDepth === 0 && objStart !== -1) {
            objects.push(streamText.substring(objStart, i + 1));
            objStart = -1;
          }
        }
      }
    }
    return objects;
  }

  // State-machine JSON parser that robustly preserves all LaTeX formulas and escapes
  function parseLlmCards(str) {
    let inString = false;
    let escaped = false;
    let out = '';
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (!inString) {
        if (c === '"') inString = true;
        out += c;
      } else {
        if (escaped) {
          if (c === '"' || c === '\\' || c === '/') {
            out += '\\' + c;
          } else if (c === 'b' || c === 'f' || c === 'n' || c === 'r' || c === 't') {
            const next = str[i + 1] || '';
            if (/[a-zA-Z]/.test(next)) {
              out += '\\\\' + c;
            } else {
              out += '\\' + c;
            }
          } else if (c === 'u' && /^[0-9a-fA-F]{4}/.test(str.substring(i + 1, i + 5))) {
            out += '\\' + c;
          } else {
            out += '\\\\' + c;
          }
          escaped = false;
        } else {
          if (c === '\\') {
            escaped = true;
          } else if (c === '"') {
            inString = false;
            out += c;
          } else if (c === '\n') {
            out += '\\n';
          } else if (c === '\r') {
            // skip carriage return
          } else if (c === '\t') {
            out += '\\t';
          } else {
            out += c;
          }
        }
      }
    }
    return JSON.parse(out);
  }

  // Robustly repairs truncated JSON objects that run out of max_tokens mid-stream
  function repairTruncatedJsonCard(str) {
    if (!str || typeof str !== 'string') return null;
    let s = str.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const firstBrace = s.indexOf('{');
    if (firstBrace === -1) return null;
    s = s.substring(firstBrace);
    let inString = false;
    let escaped = false;
    let braceCount = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') inString = false;
      } else {
        if (c === '"') inString = true;
        else if (c === '{') braceCount++;
        else if (c === '}') braceCount--;
      }
    }
    if (inString) s += '"';
    while (braceCount > 0) {
      s += '}';
      braceCount--;
    }
    try { return JSON.parse(s); }
    catch (e) {
      try { return parseLlmCards(s); }
      catch (e2) { return null; }
    }
  }

  // Resilient 3rd-tier field extractor using regex when JSON parsers fail on unescaped quotes or malformed syntax
  function extractCardFields(str) {
    if (!str || typeof str !== 'string') return null;
    const card = {};

    const titleMatch = str.match(/"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
    if (titleMatch) card.title = titleMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');

    const tagMatch = str.match(/"tag"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
    if (tagMatch) card.tag = tagMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');

    const diffMatch = str.match(/"difficulty"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
    if (diffMatch) card.difficulty = diffMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');

    const essenceMatch = str.match(/"essence"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
    if (essenceMatch) card.essence = essenceMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');

    const visualMatch = str.match(/"visual"\s*:\s*"([\s\S]*?)(?="\s*,\s*"[a-zA-Z]+")/i) ||
                        str.match(/"visual"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
    if (visualMatch) card.visual = visualMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');

    const takeawaysMatch = str.match(/"takeaways"\s*:\s*\[([\s\S]*?)\]/i);
    if (takeawaysMatch) {
      const items = [];
      const itemRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
      let im;
      while ((im = itemRegex.exec(takeawaysMatch[1])) !== null) {
        items.push(im[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
      }
      card.takeaways = items;
    }

    const stepsMatch = str.match(/"steps"\s*:\s*\[([\s\S]*?)\]/i);
    if (stepsMatch) {
      const items = [];
      const itemRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
      let im;
      while ((im = itemRegex.exec(stepsMatch[1])) !== null) {
        items.push(im[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
      }
      card.steps = items;
    }

    const trapMatch = str.match(/"examTrap"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
    if (trapMatch) card.examTrap = trapMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');

    const mnemMatch = str.match(/"mnemonic"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
    if (mnemMatch) card.mnemonic = mnemMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');

    if (card.title || card.essence || (card.takeaways && card.takeaways.length)) {
      return card;
    }
    return null;
  }

  async function generateFlashcards(rawTopic) {
    if (flashBusy) return;
    const thisGenId = ++currentGenerationId;
    deckArea.innerHTML = "";

    // Resolve subject from topic or active chip
    const activeChip = quickChips ? quickChips.querySelector('.fc-chip.active') : null;
    const activeChipSubj = activeChip ? activeChip.dataset.subject : '';
    const subjData = updateSubjectContextBadge(rawTopic || activeChipSubj || 'PPS');

    // Clean up topic string: remove leading "PPS:", "BEE:", etc. so student's prompt is clean
    let cleanTopic = (rawTopic || '').trim();
    const prefixRegex = new RegExp(`^(${subjData.alias}|${subjData.alias.replace(' Viva', '')}):\\s*`, 'i');
    if (prefixRegex.test(cleanTopic)) {
      cleanTopic = cleanTopic.replace(prefixRegex, '').trim();
    }
    if (!cleanTopic) cleanTopic = (rawTopic || '').trim();

    // Render high-end animated mock flashcard with breathing luminous pulse
    deckArea.innerHTML = `
      <div class="fc-card fc-mock-card" id="fcMockCard">
        <div>
          <div class="fc-mock-meta">
            <span class="fc-mock-tag">⚡ ${escapeHtml(subjData.alias)} · Synthesizing</span>
            <span class="fc-mock-diff">High-Yield</span>
          </div>
          <div class="fc-mock-title">
            <span class="fc-mock-title-shimmer">${escapeHtml(cleanTopic)}</span>
          </div>
          <div class="fc-mock-essence">
            <span class="fc-skeleton-line" style="width: 88%;"></span>
            <span class="fc-skeleton-line" style="width: 62%;"></span>
          </div>
          <div class="fc-mock-visual">
            <div class="fc-mock-spark">⚡</div>
            <div class="fc-mock-visual-text" id="fcMockStage">Forging visual blueprint…</div>
          </div>
          <div class="fc-mock-takeaways">
            <div class="fc-mock-takeaway-item"><span class="fc-takeaway-chevron">▸</span><span class="fc-skeleton-line" style="width: 82%;"></span></div>
            <div class="fc-mock-takeaway-item"><span class="fc-takeaway-chevron">▸</span><span class="fc-skeleton-line" style="width: 74%;"></span></div>
            <div class="fc-mock-takeaway-item"><span class="fc-takeaway-chevron">▸</span><span class="fc-skeleton-line" style="width: 58%;"></span></div>
          </div>
          <div class="fc-mock-progress"><span></span></div>
        </div>
        <div class="fc-mock-bottom">
          <div class="fc-mock-status-chip">
            <span class="fc-mock-pulse-dot"></span>
            <span>Crafting Card 1 with ${escapeHtml(getActiveAiModel())}...</span>
          </div>
          <span style="opacity: 0.6; font-size: 10.5px;">ADGIPS 2026</span>
        </div>
      </div>
    `;
    controls.style.display = 'none';
    if (streamStatus) streamStatus.style.display = 'none';

    // v0.6.14: living loader — cycle build-stage messages + progress bar while the AI works.
    // Stopped the moment the mock leaves the screen (Card 1, cache hit, error, abort).
    let mockStageTimer = null;
    const stopMockStages = () => {
      if (mockStageTimer) { clearInterval(mockStageTimer); mockStageTimer = null; }
    };
    {
      const stages = [
        'Forging visual blueprint…',
        'Solving step derivations…',
        'Hiding exam traps…',
        'Writing memory hooks…',
        'Polishing diagrams…'
      ];
      let stageIdx = 0;
      mockStageTimer = setInterval(() => {
        if (thisGenId !== currentGenerationId) { stopMockStages(); return; }
        const el = document.getElementById('fcMockStage');
        if (!el) { stopMockStages(); return; }
        stageIdx = (stageIdx + 1) % stages.length;
        el.textContent = stages[stageIdx];
        el.classList.remove('fc-mock-stage-swap');
        void el.offsetWidth;
        el.classList.add('fc-mock-stage-swap');
      }, 1600);
    }

    const model = getActiveAiModel();

    const mode = modeSelect ? modeSelect.value : 'exam';
    const cardCount = countSelect ? (parseInt(countSelect.value, 10) || 4) : 4;

    // v0.6.7 snappy: instant cache hit for identical repeat (same subject+topic+mode+count within 5min) — zero network.
    // v0.6.8: validate cached cards (skip blank shells saved by truncated v0.6.7 runs).
    try {
      const topicKey = `${subjData.alias}: ${cleanTopic}`;
      const decks = loadDecks();
      const hit = decks.find(d => d.topic === topicKey && d.mode === mode && Array.isArray(d.cards) && d.cards.length === cardCount && d.date && (Date.now() - new Date(d.date).getTime() < 300000));
      const hitValid = hit && hit.cards.every(c => {
        const t = (c.title || c.q || '').trim();
        if (t.length <= 2) return false;
        const e = String(c.essence || c.q || '').trim().length > 10;
        const v = String(c.visual || '').trim().length > 10;
        const tw = Array.isArray(c.takeaways) && c.takeaways.some(x => String(x || '').trim().length > 3);
        const st = Array.isArray(c.steps) && c.steps.some(x => String(x || '').trim().length > 3);
        return e || v || tw || st;
      });
      if (hitValid) {
        currentCards = hit.cards.map(c => normalizeCard(c, cleanTopic, subjData.alias));
        currentIndex = 0;
        if (emptyState) emptyState.style.display = 'none';
        controls.style.display = 'flex';
        renderCard(0);
        counter.textContent = `1 / ${currentCards.length}`;
        prevBtn.disabled = true;
        nextBtn.disabled = currentCards.length <= 1;
        if (streamStatus) streamStatus.style.display = 'none';
        showToast('Loaded instant revision deck ⚡');
        stopMockStages();
        renderDeckList();
        generateBtn.disabled = false;
        generateBtn.textContent = '🔥 Generate Cards';
        return;
      }
    } catch (e) {}

    flashBusy = true;
    flashAbort = new AbortController();
    const signal = flashAbort.signal;
    generateBtn.disabled = false;
    generateBtn.textContent = '⏹ Stop';

    let modePrompt = 'Focus on high-yield university end-sem exam topics (12-marker blueprints), core derivations, and essential theory from the ADGIPS/IPU curriculum.';
    if (mode === 'formulas') {
      modePrompt = 'Focus heavily on key mathematical formulas, step-by-step KaTeX equations (use \\( ... \\) and \\[ ... \\]), theorems (e.g. Thevenin, Cayley-Hamilton, Gauss Divergence), and step derivations.';
    } else if (mode === 'viva') {
      modePrompt = 'Focus on practical viva voce questions, lab experiment mechanics, apparatus setups, meter connections, and tricky viva traps frequently asked by professors (e.g. Mr. Ankit Jain for PPS, Ms. Pooja for BEE, Dr. Mamta Gupta for PHL).';
    } else if (mode === 'recall') {
      modePrompt = 'Focus on rapid active recall, crisp definitions, mnemonics, key distinctions (e.g. call by value vs reference, series vs parallel resonance), and core axioms.';
    }

    const baseSubjectPrompt = `You are StudyForged Visual Cards Engine, the elite engineering exam tutor for Satyam Kumar (B.Tech IT Sem-1, Section-E, Room 2310, ADGIPS).

TARGET ACADEMIC SUBJECT:
- Subject: ${subjData.name} (${subjData.alias}, Course Code: ${subjData.code})
- Faculty: ${subjData.faculty}
- Curriculum Units: ${subjData.units}
- Subject Domain & Conventions: ${subjData.context}

MANDATORY SUBJECT-CURATION DIRECTIVE:
You MUST generate cards STRICTLY within the context, scope, and syllabus conventions of ${subjData.alias} (${subjData.name}).
- Even if the student asks a general or conceptual question (for example: "What is recursion?", "Explain pointers", "Dynamic memory", "Equilibrium of forces", "Thevenin theorem", "Resonance"), you MUST frame all explanations, equations, code, definitions, and diagrams EXCLUSIVELY in the context of ${subjData.alias}.
  * For PPS / PPS Viva: ALL code must be written in ANSI C (C99/C11). Mention memory models, stack frames, call stack, base conditions, return addresses, and pointer traps as expected by Mr. Ankit Jain and Ms. Alka. Do NOT use Python, Java, or JavaScript.
  * For BEE / BEE Viva: Ground everything in circuit theory, Ohm's/Kirchhoff's laws, AC phasors, RLC circuits, or lab apparatus as expected by Ms. Pooja.
  * For SMT: Ground everything in applied engineering mathematics, calculus, matrices, and theorems as taught by Dr. Suryya Farhat.
  * For PHL: Ground everything in semiconductor physics, energy band theory, and PN junctions as taught by Dr. Mamta Gupta.
  * For EM: Ground everything in statics, dynamics, FBDs, and mechanics as taught by Mr. Naman Bajpai.
- The "tag" field for each card MUST start with "${subjData.alias} · " (e.g. "${subjData.alias} · Unit 2", "${subjData.alias} · Core Rule", "${subjData.alias} · Viva Trap").
- The "examTrap" field MUST cite realistic exam/viva pitfalls and mistakes that professors in ${subjData.alias} penalize.`;

    const getJsonSchemaInstructions = (numCards) => `CRITICAL: Return ONLY a valid JSON array of ${numCards} objects with these exact keys:
- "title": Short, punchy concept title (e.g. "${subjData.alias}: Recursion & Base Condition", "Stack Frame Anatomy", "Norton's Equivalent Circuit").
- "tag": Short subject or unit tag (MUST begin with "${subjData.alias} · ", e.g. "${subjData.alias} · Unit 2", "${subjData.alias} · High-Yield").
- "difficulty": Exactly one of "High-Yield", "Medium", or "Easy".
- "essence": Exactly 1 crisp sentence (max ~25 words) explaining the core principle or rule.
- "visual": A visual element for the card. Keep it lightweight and compact for fast rendering. Choose the best option:
    * An inline SVG diagram: Use single quotes for all attributes (e.g. <svg viewBox='0 0 380 90' xmlns='http://www.w3.org/2000/svg'>...). Max ~12 shapes, simple clean shapes (<rect>, <circle>, <line>, <path>, <text font-size='11' fill='#111'>) with high-contrast accents (#f59e0b, #3b82f6, #10b981, #ef4444).
    * OR a centered KaTeX display equation: e.g. \\[ T(n) = T(n-1) + O(1) \\] or \\[ V_{th} = V_{oc} \\]
    * OR a short formatted code snippet (ANSI C for PPS, max ~10 lines): \`\`\`c ... \`\`\`
- "takeaways": Array of exactly 3 crisp bullets, each max ~14 words. Start each with a bold phrase (e.g. "**Base Condition Rule:** Must precede recursive call to avoid stack overflow", "**Time Complexity:** \\(O(1)\\) constant time access").
- "steps": Array of 3 to 4 sequential steps, each max ~22 words, detailing the exact procedure/derivation/memory execution. Start each with a bold action (e.g. "**Step 1: Compute Open-Circuit Voltage \\(V_{oc}\\)** by removing the load resistor...").
- "examTrap": Exactly 1 common exam pitfall, calculation trap, or professor viva question to watch out for. Mention what professors specifically penalize.
- "mnemonic": A short, memorable hook or memory aid (e.g. "**Mnemonic: BASE** - Before Any Step Executes").

CRITICAL JSON RULES:
- Return ONLY the raw JSON array. No conversational text, no markdown wrapping fences.
- In JSON string values, double-escape all LaTeX backslashes (e.g. \\\\( ... \\\\), \\\\[ ... \\\\]).
- For SVG attributes, ALWAYS use single quotes (e.g. width='100%') so JSON double quotes remain valid.`;

    const activeApiUrl = getActiveAiApiUrl();
    async function streamLlmCards(payload, onNewCard) {
      let resp;
      let lastFetchErr = null;
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache'
      };

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          resp = await fetch(activeApiUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload),
            signal
          });
          if (resp.ok) break;
          if (attempt === 1 && resp.status >= 500) {
            await new Promise(r => setTimeout(r, 700));
            continue;
          }
          break;
        } catch (firstErr) {
          if (firstErr && firstErr.name === 'AbortError') throw firstErr;
          lastFetchErr = firstErr;
          if (attempt === 1) {
            try {
              resp = await fetch(getActiveAiApiFallbackUrl(), {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload),
                signal
              });
              if (resp.ok) break;
            } catch (fallbackErr) {
              if (fallbackErr && fallbackErr.name === 'AbortError') throw fallbackErr;
              lastFetchErr = fallbackErr;
            }
            await new Promise(r => setTimeout(r, 700));
          }
        }
      }

      if (!resp) throw (lastFetchErr || new Error('Network error reaching AI backend'));

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        let rawMsg = errData.error?.message || `API error ${resp.status}`;
        if (resp.status === 401) showToast('AI gateway authentication failed');
        else if (resp.status === 402) showToast('Pass/credits required for model');
        else if (resp.status === 429) showToast('Rate limit reached. Please wait');
        else showToast(`Flashcards error: ${rawMsg}`);
        if (isModelMissingError(rawMsg)) healDeadModel();
        throw new Error(rawMsg);
      }

      let parsedCount = 0;
      // v0.6.7 snappy: throttle O(n) object scan — only rescan after meaningful growth.
      let lastExtractLen = 0;
      if (resp.body && typeof resp.body.getReader === 'function') {
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulatedContent = '';

        while (true) {
          if (signal.aborted) {
            try { reader.cancel(); } catch (e) {}
            throw new DOMException('Generation stopped', 'AbortError');
          }
          if (thisGenId !== currentGenerationId) {
            try { reader.cancel(); } catch (e) {}
            return;
          }
          let readResult;
          try {
            readResult = await reader.read();
          } catch (readErr) {
            console.warn('Stream reader interrupted or dropped:', readErr);
            break;
          }
          const { done, value } = readResult;
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]' || trimmed.startsWith(':')) continue;
            if (trimmed.startsWith('data: ')) {
              try {
                const json = JSON.parse(trimmed.slice(6));
                const delta = json.choices?.[0]?.delta;
                const deltaText = (delta && (delta.content || delta.text)) || '';
                if (deltaText) {
                  accumulatedContent += deltaText;
                  // Throttle: skip rescan for tiny appends unless a closing brace arrived.
                  const grew = accumulatedContent.length - lastExtractLen;
                  const maybeClosed = deltaText.includes('}') || accumulatedContent.length - lastExtractLen > 250;
                  if (!maybeClosed && grew <= 250) continue;
                  lastExtractLen = accumulatedContent.length;
                  const rawObjs = extractCompleteObjects(accumulatedContent);
                  while (rawObjs.length > parsedCount) {
                    if (thisGenId !== currentGenerationId) return;
                    const nextRaw = rawObjs[parsedCount];
                    let cardObj = null;
                    try {
                      cardObj = JSON.parse(nextRaw);
                    } catch (e1) {
                      try {
                        cardObj = parseLlmCards(nextRaw);
                      } catch (e2) {
                        try {
                          cardObj = repairTruncatedJsonCard(nextRaw);
                        } catch (e3) {
                          cardObj = null;
                        }
                      }
                    }
                    if (!cardObj) {
                      cardObj = extractCardFields(nextRaw);
                    }
                    if (cardObj && typeof cardObj === 'object') {
                      parsedCount++;
                      const norm = normalizeCard(cardObj, cleanTopic, subjData.alias);
                      onNewCard(norm);
                    } else {
                      if (rawObjs.length > parsedCount + 1) {
                        parsedCount++;
                      } else {
                        break;
                      }
                    }
                  }
                }
              } catch (e) {}
            }
          }
        }

        // Post-stream fallback: if real-time object extractor missed cards, recover them now
        if (parsedCount === 0 && accumulatedContent.trim()) {
          let cleaned = accumulatedContent.trim()
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();
          const firstBracket = cleaned.indexOf('[');
          const lastBracket = cleaned.lastIndexOf(']');
          let parsedArr = null;
          if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
            const arrStr = cleaned.substring(firstBracket, lastBracket + 1);
            try { parsedArr = JSON.parse(arrStr); }
            catch (e) { try { parsedArr = parseLlmCards(arrStr); } catch (e2) {} }
          }
          if (Array.isArray(parsedArr) && parsedArr.length) {
            parsedArr.forEach(c => onNewCard(normalizeCard(c, cleanTopic, subjData.alias)));
          } else {
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');
            let singleObj = null;
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              const single = cleaned.substring(firstBrace, lastBrace + 1);
              try { singleObj = JSON.parse(single); }
              catch (e) { try { singleObj = parseLlmCards(single); } catch (e3) {} }
            }
            if (!singleObj) {
              singleObj = repairTruncatedJsonCard(cleaned);
            }
            if (!singleObj) {
              singleObj = extractCardFields(cleaned);
            }
            if (singleObj && typeof singleObj === 'object') {
              onNewCard(normalizeCard(singleObj, cleanTopic, subjData.alias));
            }
          }
        }
      } else {
        // Non-streaming fallback
        const data = await resp.json();
        let raw = (data.choices?.[0]?.message?.content || '').trim();
        raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        const firstBracket = raw.indexOf('[');
        const lastBracket = raw.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
          raw = raw.substring(firstBracket, lastBracket + 1);
        }
        let cards;
        try { cards = JSON.parse(raw); }
        catch (e) { cards = parseLlmCards(raw); }
        if (Array.isArray(cards)) {
          cards.forEach(c => onNewCard(normalizeCard(c, cleanTopic, subjData.alias)));
        } else if (cards && typeof cards === 'object') {
          onNewCard(normalizeCard(cards, cleanTopic, subjData.alias));
        } else {
          let repaired = repairTruncatedJsonCard(raw);
          if (!repaired) repaired = extractCardFields(raw);
          if (repaired && typeof repaired === 'object') {
            onNewCard(normalizeCard(repaired, cleanTopic, subjData.alias));
          }
        }
      }
    }

    function syncCurrentDeckToStorage() {
      if (!currentCards.length) return;
      const decks = loadDecks();
      const topicKey = `${subjData.alias}: ${cleanTopic}`;
      const existingIdx = decks.findIndex(d => d.topic === topicKey && d.date && (Date.now() - new Date(d.date).getTime() < 300000));
      const deckData = {
        topic: topicKey,
        subject: subjData.alias,
        mode,
        cards: currentCards,
        date: new Date().toISOString()
      };
      if (existingIdx !== -1) {
        decks[existingIdx] = deckData;
      } else {
        decks.unshift(deckData);
        if (decks.length > 20) decks.pop();
      }
      saveDecks(decks);
      renderDeckList();
    }

    function finishDeck() {
      if (!currentCards.length) return;
      syncCurrentDeckToStorage();

      counter.textContent = `${currentIndex + 1} / ${currentCards.length}`;
      nextBtn.disabled = currentIndex >= currentCards.length - 1;
      prevBtn.disabled = currentIndex === 0;

      if (streamStatus) {
        streamStatus.className = 'fc-stream-status complete';
        streamStatus.innerHTML = `<span class="fc-stream-dot"></span><span>✓ All ${currentCards.length} visual cards ready! 🔥</span>`;
        setTimeout(() => {
          if (streamStatus && streamStatus.classList.contains('complete')) {
            streamStatus.style.display = 'none';
          }
        }, 4000);
      }
      showToast(`All ${currentCards.length} visual study cards ready! 🔥`);
    }

    currentCards = [];
    currentIndex = 0;

    try {
      // ── PHASE 1: Fast-Path Card 1 (Instant Render) ──
      const phase1System = `${baseSubjectPrompt}

Generate exactly 1 foundational, high-yield visual study card (Card 1) that introduces the core definition, master formula/diagram, and fundamental rule for: "${cleanTopic}".
Keep the visual element concise, lightweight, and clean (viewBox='0 0 380 90' for simple SVGs, or display KaTeX equation, or ANSI C code).
${modePrompt}

${getJsonSchemaInstructions(1)}`;

      const phase1Payload = {
        model: model,
        messages: [
          { role: 'system', content: phase1System },
          { role: 'user', content: `Generate the foundational Card 1 visual study card for "${subjData.alias} — ${subjData.name}" on topic: "${cleanTopic}" in ${mode} mode.` }
        ],
        stream: true,
        temperature: 0.6,
        max_tokens: 8000,
        reasoning_effort: 'minimal'
      };

      // v0.6.8 blank-card guard: never render/count a shell with no readable content.
      const isValidCard = (c) => {
        if (!c || typeof c !== 'object') return false;
        const titleOk = typeof c.title === 'string' && c.title.trim().length > 2;
        if (!titleOk) return false;
        const hasEssence = typeof c.essence === 'string' && c.essence.trim().length > 10;
        const hasVisual = typeof c.visual === 'string' && c.visual.trim().length > 10;
        const hasTakeaways = Array.isArray(c.takeaways) && c.takeaways.some(t => String(t || '').trim().length > 3);
        const hasSteps = Array.isArray(c.steps) && c.steps.some(s => String(s || '').trim().length > 3);
        return hasEssence || hasVisual || hasTakeaways || hasSteps;
      };

      await streamLlmCards(phase1Payload, (card) => {
        if (thisGenId !== currentGenerationId) return;
        if (!isValidCard(card)) return;
        stopMockStages();
        currentCards.push(card);
        // Render Card 1 immediately!
        if (emptyState) emptyState.style.display = 'none';
        controls.style.display = 'flex';
        renderCard(0);
        counter.textContent = `1 / ${cardCount}`;
        prevBtn.disabled = true;
        nextBtn.disabled = true;

        if (streamStatus) {
          streamStatus.className = 'fc-stream-status';
          streamStatus.style.display = 'inline-flex';
          const remainingMsg = cardCount > 1 ? `Generating remaining ${cardCount - 1} cards in background...` : 'Card ready!';
          streamStatus.innerHTML = `<span class="fc-stream-dot"></span><span>⚡ Card 1 ready • ${remainingMsg}</span>`;
        }
        syncCurrentDeckToStorage();
        showToast('Card 1 ready! ⚡ Generating remaining cards...');
      });

      if (thisGenId !== currentGenerationId) return;

      if (!currentCards.length) {
        throw new Error('No valid Card 1 was extracted from stream');
      }

      // If user only requested 1 card, complete immediately
      if (cardCount <= 1) {
        finishDeck();
        return;
      }

      // ── PHASE 2: Background singles for remaining cards (Cards 2..N, one per request) ──
      // v0.6.11 user demand: 1-by-1 so each card lands visibly for 6/8-count decks.
      // v0.6.10 fix: one big 5-7-card request stalled/truncated → zero follow-ups + stuck banner.
      // Small singles isolate failures; honest partial status replaces silent "All ready".
      let phase2Note = '';
      try {
        while (currentCards.length < cardCount) {
          if (thisGenId !== currentGenerationId) return;
          if (signal.aborted) throw new DOMException('Generation stopped', 'AbortError');
          const remaining = cardCount - currentCards.length;
          // v0.6.11 user demand: 1 card per request so each lands visibly (1,1,1…) for 6/8-count decks.
          const batchSize = 1;
          const haveTitles = currentCards.map(c => `"${String(c.title || '').slice(0, 60)}"`).join(', ');
          const batchSystem = `${baseSubjectPrompt}

The student is already studying: ${haveTitles}.
Now generate exactly ${batchSize} complementary advanced/applied study cards for the remaining sub-concepts, step derivations, applications, and traps on: "${cleanTopic}".
Do NOT repeat concepts/visuals already covered above.
${modePrompt}

${getJsonSchemaInstructions(batchSize)}`;

          const batchPayload = {
            model: model,
            messages: [
              { role: 'system', content: batchSystem },
              { role: 'user', content: `Generate ${batchSize} complementary study cards for "${subjData.alias} — ${subjData.name}" on topic: "${cleanTopic}" in ${mode} mode. Keep each visual lightweight (small SVG ~380x90, or 1 KaTeX block, or <=10-line C snippet).` }
            ],
            stream: true,
            temperature: 0.6,
            max_tokens: 8000,
            reasoning_effort: 'minimal'
          };

          const lenBefore = currentCards.length;
          try {
            await streamLlmCards(batchPayload, (card) => {
              if (thisGenId !== currentGenerationId) return;
              if (!isValidCard(card)) return;
              currentCards.push(card);
              syncCurrentDeckToStorage();
              // Dynamically update counter and enable next button as new cards arrive
              counter.textContent = `${currentIndex + 1} / ${currentCards.length}`;
              nextBtn.disabled = currentIndex >= currentCards.length - 1;
              if (streamStatus) {
                streamStatus.className = 'fc-stream-status';
                streamStatus.style.display = 'inline-flex';
                const nextTarget = currentCards.length < cardCount ? `Generating card ${currentCards.length + 1} of ${cardCount}...` : 'Finalizing deck...';
                streamStatus.innerHTML = `<span class="fc-stream-dot"></span><span>Card ${currentCards.length} ready • ${nextTarget}</span>`;
              }
            });
          } catch (batchErr) {
            if (batchErr && batchErr.name === 'AbortError') throw batchErr;
            console.warn('Phase 2 batch notice:', batchErr);
            phase2Note = (batchErr && batchErr.message) ? String(batchErr.message) : 'background request interrupted';
            break;
          }
          if (thisGenId !== currentGenerationId) return;
          if (currentCards.length === lenBefore) {
            // Batch returned zero new cards (stall/truncation) — stop hammering, report honestly.
            phase2Note = phase2Note || 'background stream returned no new cards';
            break;
          }
        }
      } catch (phase2Err) {
        console.warn('Phase 2 background stream notice:', phase2Err);
        phase2Note = (phase2Err && phase2Err.message) ? String(phase2Err.message) : 'background request interrupted';
        // Do not fail the whole deck: Card 1 is already ready and interactive
      }

      if (thisGenId !== currentGenerationId) return;
      if (currentCards.length < cardCount) {
        // Honest partial deck: keep ready cards usable, say exactly what happened (stays visible).
        syncCurrentDeckToStorage();
        counter.textContent = `${currentIndex + 1} / ${currentCards.length}`;
        nextBtn.disabled = currentIndex >= currentCards.length - 1;
        prevBtn.disabled = currentIndex === 0;
        if (streamStatus) {
          streamStatus.className = 'fc-stream-status';
          streamStatus.style.display = 'inline-flex';
          streamStatus.innerHTML = `<span class="fc-stream-dot"></span><span>⚠️ Only ${currentCards.length} of ${cardCount} cards arrived${phase2Note ? ` (${escapeHtml(phase2Note)})` : ''} — tap 🔥 Generate to retry.</span>`;
        }
        showToast(`Only ${currentCards.length} of ${cardCount} arrived — tap Generate to retry.`);
      } else {
        finishDeck();
      }

    } catch (err) {
      if (thisGenId !== currentGenerationId) return;
      stopMockStages();
      if (err && err.name === 'AbortError') {
        if (currentCards.length) {
          syncCurrentDeckToStorage();
          counter.textContent = `${currentIndex + 1} / ${currentCards.length}`;
          prevBtn.disabled = currentIndex === 0;
          nextBtn.disabled = currentIndex >= currentCards.length - 1;
          if (streamStatus) {
            streamStatus.className = 'fc-stream-status';
            streamStatus.style.display = 'inline-flex';
            streamStatus.innerHTML = `<span class="fc-stream-dot"></span><span>⏹ Stopped — ${currentCards.length} card(s) ready and saved.</span>`;
          }
          showToast(`Stopped — ${currentCards.length} card(s) ready.`);
        } else {
          deckArea.innerHTML = `<div class="fc-empty-state" id="fcEmptyState"><span class="fc-empty-icon">⏹</span><p>Generation stopped. Write a topic and hit Generate when ready.</p></div>`;
          emptyState = deckArea.querySelector('#fcEmptyState');
          controls.style.display = 'none';
          if (streamStatus) streamStatus.style.display = 'none';
          showToast('Generation stopped.');
        }
        return;
      }
      console.error('Flashcard generation error:', err);
      if (!currentCards.length) {
        deckArea.innerHTML = `<div class="fc-empty-state" id="fcEmptyState"><span class="fc-empty-icon">⚠️</span><p>Failed to generate cards: ${escapeHtml(err.message || 'Unknown error')}. Please try again.</p></div>`;
        emptyState = deckArea.querySelector('#fcEmptyState');
        if (streamStatus) streamStatus.style.display = 'none';
        controls.style.display = 'none';
      } else {
        finishDeck();
      }
      showToast(`Flashcards error: ${err.message || 'Generation issue'}`);
    } finally {
      stopMockStages();
      flashBusy = false;
      flashAbort = null;
      if (thisGenId === currentGenerationId) {
        generateBtn.disabled = false;
        generateBtn.textContent = '🔥 Generate Cards';
      }
    }
  }

  generateBtn.addEventListener('click', () => {
    if (flashBusy) {
      if (flashAbort) flashAbort.abort();
      showToast('Stopping generation…');
      return;
    }
    const topic = topicInput ? topicInput.value.trim() : '';
    if (!topic) {
      showToast('Pick a subject chip or write a topic to study!');
      if (topicInput) topicInput.focus();
      return;
    }
    // If the input only contains a subject prefix like "EM:" or "PPS: " with no topic specified
    const isOnlyPrefix = /^[a-zA-Z\s]+:\s*$/.test(topic);
    if (isOnlyPrefix) {
      const subj = topic.replace(':', '').trim();
      showToast(`Please write your specific topic to study in ${subj}!`);
      if (topicInput) {
        topicInput.focus();
        topicInput.setSelectionRange(topic.length, topic.length);
      }
      return;
    }
    generateFlashcards(topic);
  });

  if (topicInput) {
    topicInput.addEventListener('input', () => {
      const val = topicInput.value.trim().toUpperCase();
      let matchedSubj = null;
      if (quickChips) {
        quickChips.querySelectorAll('.fc-chip').forEach(chip => {
          const subj = (chip.dataset.subject || '').toUpperCase();
          if (subj && (val.startsWith(subj + ':') || val.startsWith(subj + ' '))) {
            chip.classList.add('active');
            matchedSubj = chip.dataset.subject;
          } else {
            chip.classList.remove('active');
          }
        });
      }
      if (matchedSubj) {
        updateSubjectContextBadge(matchedSubj);
      }
    });
    topicInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') generateBtn.click();
    });
  }

  // Set default initial subject context to PPS
  updateSubjectContextBadge("PPS");

  // ── AI Quiz Arena (bottom of flashcard section, dedicated in-app quiz page) ──
  const QUIZ_STORAGE = 'studyForge_quiz';
  const quizTopicInput = document.getElementById('quizTopicInput');
  const quizCountSelect = document.getElementById('quizCountSelect');
  const quizGenerateBtn = document.getElementById('quizGenerateBtn');
  const quizStatus = document.getElementById('quizStatus');
  const quizHistoryList = document.getElementById('quizHistoryList');
  const quizClearBtn = document.getElementById('quizClearBtn');
  const quizPage = document.getElementById('quizPage');
  const quizPageTitle = document.getElementById('quizPageTitle');
  const quizPageProgress = document.getElementById('quizPageProgress');
  const quizLiveScore = document.getElementById('quizLiveScore');
  const quizPageBody = document.getElementById('quizPageBody');
  const quizNextQBtn = document.getElementById('quizNextQBtn');
  const quizBackBtn = document.getElementById('quizBackBtn');

  let quizQuestions = [];
  let quizIndex = 0;
  let quizScore = 0;
  let quizTopicLabel = '';
  let quizAnswered = false;

  function loadQuizHistory() {
    try { return JSON.parse(localStorage.getItem(QUIZ_STORAGE)) || []; }
    catch { return []; }
  }
  function saveQuizHistory(h) {
    try { localStorage.setItem(QUIZ_STORAGE, JSON.stringify(h)); } catch (e) {}
  }
  function renderQuizHistory() {
    if (!quizHistoryList) return;
    const h = loadQuizHistory();
    quizHistoryList.innerHTML = '';
    if (!h.length) {
      const p = document.createElement('p');
      p.className = 'fc-no-decks';
      p.textContent = 'No quizzes yet — start your first test above!';
      quizHistoryList.appendChild(p);
      return;
    }
    h.forEach((a) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'quiz-history-item';
      const name = document.createElement('span');
      name.className = 'quiz-history-name';
      name.textContent = String(a.topic || 'Quiz');
      const badge = document.createElement('span');
      badge.className = 'quiz-history-score';
      badge.textContent = `${a.score}/${a.total}`;
      row.append(name, badge);
      row.addEventListener('click', () => {
        if (quizTopicInput) {
          quizTopicInput.value = String(a.topic || '');
          quizTopicInput.focus();
        }
      });
      quizHistoryList.appendChild(row);
    });
  }
  if (quizClearBtn) {
    quizClearBtn.addEventListener('click', () => {
      saveQuizHistory([]);
      renderQuizHistory();
      showToast('Quiz history cleared.');
    });
  }

  function normalizeQuizQ(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const q = String(raw.q || raw.question || '').trim();
    const opts = Array.isArray(raw.options) ? raw.options.map(o => String(o == null ? '' : o).trim()) : [];
    let ans = (typeof raw.answer === 'number') ? raw.answer : parseInt(raw.answer, 10);
    if (!q || opts.length !== 4 || opts.some(o => !o) || !(ans >= 0 && ans <= 3)) return null;
    return {
      q,
      options: opts,
      answer: ans,
      explain: String(raw.explain || raw.explanation || '').trim(),
      trap: String(raw.trap || raw.examTrap || '').trim()
    };
  }

  function parseQuizJson(raw) {
    let cleaned = String(raw || '').trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      cleaned = cleaned.substring(firstBracket, lastBracket + 1);
    }
    try { return JSON.parse(cleaned); }
    catch (e) { return parseLlmCards(cleaned); }
  }

  // Regex field extractor for a single quiz object when JSON parsers choke (mirrors extractCardFields).
  function extractQuizQFields(str) {
    if (!str || typeof str !== 'string') return null;
    const card = {};
    const qm = str.match(/"q"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i) || str.match(/"question"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
    if (qm) card.q = qm[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    const om = str.match(/"options"\s*:\s*\[([\s\S]*?)\]/i);
    if (om) {
      const items = [];
      const itemRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
      let im;
      while ((im = itemRegex.exec(om[1])) !== null) {
        items.push(im[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
      }
      card.options = items;
    }
    const am = str.match(/"answer"\s*:\s*([0-3])/i);
    if (am) card.answer = parseInt(am[1], 10);
    const em = str.match(/"explan"\w*\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
    if (em) card.explain = em[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    const tm = str.match(/"trap"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
    if (tm) card.trap = tm[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    if (card.q && Array.isArray(card.options) && card.options.length === 4) return card;
    return null;
  }

  // Salvage path: pull each balanced {...} out of a truncated/garbled response and keep what parses.
  function salvageQuizQuestions(raw) {
    const out = [];
    let objs = [];
    try { objs = extractCompleteObjects(String(raw || '')); } catch (e) { return out; }
    for (const o of objs) {
      let obj = null;
      try { obj = JSON.parse(o); }
      catch (e1) {
        try { obj = parseLlmCards(o); }
        catch (e2) { obj = extractQuizQFields(o); }
      }
      const n = normalizeQuizQ(obj);
      if (n && !out.some(v => v.q === n.q)) out.push(n);
    }
    return out;
  }

  async function fetchQuizQuestions(subjData, cleanTopic, qCount) {
    const model = getActiveAiModel();
    const activeApiUrl = getActiveAiApiUrl();
    const schema = `CRITICAL: Return ONLY a valid JSON array of exactly ${qCount} objects with these exact keys:
- "q": The question (one crisp line; KaTeX \\( ... \\) for math, ANSI C in \`\`\`c fences for PPS code).
- "options": Array of exactly 4 short answer options (max ~12 words each). Exactly one is correct.
- "answer": Index (0-3) of the correct option. Vary positions across questions — do NOT always use 0.
- "explain": 1-2 line reason why the answer is right.
- "trap": 1-line exam/viva trap for this concept (what professors penalize).
CRITICAL JSON RULES: raw JSON array only, no fences; double-escape LaTeX backslashes.`;
    const system = `You are StudyForged Quiz Engine, elite engineering exam tutor for Satyam Kumar (B.Tech IT Sem-1, Sec-E, ADGIPS).
TARGET SUBJECT: ${subjData.name} (${subjData.alias}, ${subjData.code}) · Faculty: ${subjData.faculty} · Units: ${subjData.units}
Ground every question STRICTLY in ${subjData.alias} conventions.${subjData.alias.startsWith('PPS') ? ' ALL code in ANSI C (C99/C11) — never Python/JS.' : ''}
${schema}
REASONING: Keep reasoning concise and output the JSON directly.`;
    const payload = {
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Write a ${qCount}-question MCQ quiz on "${cleanTopic}" for ${subjData.alias}. Mix recall + application + one viva-trap question.` }
      ],
      stream: false,
      temperature: 0.5,
      max_tokens: qCount <= 5 ? 6000 : 8000,
      reasoning_effort: 'low'
    };
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' };
    let resp = null;
    let lastErr = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        resp = await fetch(attempt === 1 ? activeApiUrl : getActiveAiApiFallbackUrl(), {
          method: 'POST', headers, body: JSON.stringify(payload)
        });
        if (resp.ok) break;
        if (attempt === 1 && resp.status >= 500) {
          await new Promise(r => setTimeout(r, 700));
          continue;
        }
        break;
      } catch (e) {
        lastErr = e;
        if (attempt === 1) await new Promise(r => setTimeout(r, 700));
      }
    }
    if (!resp) throw (lastErr || new Error('Network error reaching AI backend'));
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      const quizErr = errData?.error?.message || `Quiz API error ${resp.status}`;
      throw new Error(quizErr);
    }
    const data = await resp.json();
    const raw = (data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '').trim();
    if (!raw) {
      if (data.choices?.[0]?.finish_reason === 'length') {
        throw new Error('Quiz exceeded token capacity — tap Start to retry');
      }
      throw new Error('Empty quiz response — tap Start to retry');
    }
    let valid = [];
    try {
      const parsed = parseQuizJson(raw);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      valid = arr.map(normalizeQuizQ).filter(Boolean).slice(0, qCount);
    } catch (e) { /* fall through to salvage below */ }
    if (valid.length < 3) {
      // Truncated/garbled array — salvage complete question objects out of the raw text.
      const seen = new Set(valid.map(v => v.q));
      for (const s of salvageQuizQuestions(raw)) {
        if (valid.length >= qCount) break;
        if (!seen.has(s.q)) { valid.push(s); seen.add(s.q); }
      }
    }
    if (valid.length < 3) throw new Error('QUIZ_GARBLED');
    return valid;
  }

  function openQuizPage() {
    if (!quizPage) return;
    quizPage.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
  function closeQuizPage() {
    if (!quizPage) return;
    quizPage.style.display = 'none';
    document.body.style.overflow = '';
    resetQuizHelp();
  }
  if (quizBackBtn) {
    quizBackBtn.addEventListener('click', () => {
      closeQuizPage();
      showToast('Quiz exited — progress for this run is discarded.');
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && quizPage && quizPage.style.display !== 'none') closeQuizPage();
  });

  function renderQuizQ() {
    if (!quizPageBody) return;
    quizAnswered = false;
    const q = quizQuestions[quizIndex];
    quizPageBody.innerHTML = '';
    if (quizNextQBtn) quizNextQBtn.style.display = 'none';
    if (quizPageProgress) quizPageProgress.textContent = `Q ${quizIndex + 1} / ${quizQuestions.length}`;
    if (quizLiveScore) quizLiveScore.textContent = `${quizScore} ✅`;

    const card = document.createElement('div');
    card.className = 'quiz-q-card';
    const qEl = document.createElement('div');
    qEl.className = 'quiz-q-text';
    qEl.innerHTML = mdToHtml(q.q);
    card.appendChild(qEl);

    const optsBox = document.createElement('div');
    optsBox.className = 'quiz-options';
    // Shuffle option order per attempt so correct answers never sit in one slot.
    const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    order.forEach((origIdx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quiz-option';
      btn.innerHTML = mdToHtml(q.options[origIdx]);
      btn.addEventListener('click', () => {
        if (quizAnswered) return;
        quizAnswered = true;
        const correct = origIdx === q.answer;
        optsBox.querySelectorAll('.quiz-option').forEach((b, bi) => {
          b.disabled = true;
          if (order[bi] === q.answer) b.classList.add('correct');
        });
        if (correct) {
          quizScore++;
          if (quizLiveScore) quizLiveScore.textContent = `${quizScore} ✅`;
          showToast('Correct! +10 XP at the end 🔥');
        } else {
          btn.classList.add('wrong');
        }
        if (q.explain) {
          const ex = document.createElement('div');
          ex.className = 'quiz-explain';
          ex.innerHTML = `<strong>💡 Why:</strong> ${mdToHtml(q.explain)}`;
          card.appendChild(ex);
        }
        if (q.trap) {
          const tr = document.createElement('div');
          tr.className = 'quiz-trap';
          tr.innerHTML = `<strong>⚠️ Trap:</strong> ${mdToHtml(q.trap)}`;
          card.appendChild(tr);
        }
        const last = quizIndex >= quizQuestions.length - 1;
        if (quizNextQBtn) {
          quizNextQBtn.style.display = '';
          quizNextQBtn.textContent = last ? 'See Result 🏁' : 'Next →';
        }
      });
      optsBox.appendChild(btn);
    });
    card.appendChild(optsBox);
    quizPageBody.appendChild(card);
    noteQuizHelpNewQuestion();
  }

  function renderQuizResult() {
    if (!quizPageBody) return;
    quizPageBody.innerHTML = '';
    if (quizNextQBtn) quizNextQBtn.style.display = 'none';
    if (quizPageProgress) quizPageProgress.textContent = 'Result';
    const total = quizQuestions.length;
    const pct = Math.round((quizScore / total) * 100);
    const xp = quizScore * 10 + (quizScore === total ? 20 : 0);
    if (xp > 0) awardXP(xp);
    if (pct >= 80) triggerConfetti();

    const res = document.createElement('div');
    res.className = 'quiz-result-card';
    const emoji = pct === 100 ? '🏆' : pct >= 80 ? '🔥' : pct >= 50 ? '💪' : '📚';
    const h = document.createElement('h3');
    h.textContent = `${emoji} ${quizScore} / ${total} (${pct}%)`;
    res.appendChild(h);
    const sub = document.createElement('p');
    sub.textContent = pct === 100 ? `Perfect! +${xp} XP — flawless victory!`
      : pct >= 80 ? `Excellent! +${xp} XP earned.`
      : pct >= 50 ? `Good fight! +${xp} XP. Review the traps and retake.`
      : `Keep grinding — +${xp} XP. Revisit the deck, then retake!`;
    res.appendChild(sub);
    const row = document.createElement('div');
    row.className = 'quiz-result-actions';
    const retake = document.createElement('button');
    retake.type = 'button';
    retake.className = 'quiz-next-btn';
    retake.textContent = '🔁 Retake';
    retake.addEventListener('click', () => {
      quizIndex = 0;
      quizScore = 0;
      resetQuizHelp();
      renderQuizQ();
    });
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'ghost';
    done.textContent = 'Done';
    done.addEventListener('click', closeQuizPage);
    row.append(retake, done);
    res.appendChild(row);
    quizPageBody.appendChild(res);

    try {
      const hst = loadQuizHistory();
      hst.unshift({ topic: quizTopicLabel, count: total, score: quizScore, total, date: new Date().toISOString() });
      saveQuizHistory(hst.slice(0, 20));
      renderQuizHistory();
    } catch (e) {}
    showToast(`Quiz done: ${quizScore}/${total} • +${xp} XP`);
    noteQuizHelpResult(pct);
  }
  if (quizNextQBtn) {
    quizNextQBtn.addEventListener('click', () => {
      if (!quizAnswered) return;
      if (quizIndex < quizQuestions.length - 1) {
        quizIndex++;
        renderQuizQ();
      } else {
        renderQuizResult();
      }
    });
  }

  // ── Hint Buddy: in-quiz tutor chat (nudges, never spoilers; question-aware) ──
  const quizHelpBtn = document.getElementById('quizHelpBtn');
  const quizHelpPanel = document.getElementById('quizHelpPanel');
  const quizHelpMsgs = document.getElementById('quizHelpMsgs');
  const quizHelpChips = document.getElementById('quizHelpChips');
  const quizHelpInput = document.getElementById('quizHelpInput');
  const quizHelpSend = document.getElementById('quizHelpSend');
  const quizHelpClose = document.getElementById('quizHelpClose');
  let quizHelpHistory = [];
  let quizHelpBusy = false;
  const QUIZ_HELP_CHIP_QS = ['🤏 Give me a hint', '📐 Which formula do I need?', '❌ Eliminate one option'];

  function quizHelpScroll() {
    if (quizHelpMsgs) quizHelpMsgs.scrollTop = quizHelpMsgs.scrollHeight;
  }
  function addQuizHelpMsg(role, html) {
    if (!quizHelpMsgs) return;
    const d = document.createElement('div');
    d.className = `quiz-help-msg ${role}`;
    if (role === 'user') d.textContent = html;
    else d.innerHTML = html;
    quizHelpMsgs.appendChild(d);
    quizHelpScroll();
  }
  function resetQuizHelp() {
    quizHelpHistory = [];
    quizHelpBusy = false;
    if (quizHelpMsgs) quizHelpMsgs.innerHTML = '';
    renderQuizHelpChips();
  }
  function renderQuizHelpChips() {
    if (!quizHelpChips) return;
    quizHelpChips.innerHTML = '';
    QUIZ_HELP_CHIP_QS.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'quiz-help-chip';
      b.textContent = c;
      b.addEventListener('click', () => sendQuizHelp(c));
      quizHelpChips.appendChild(b);
    });
  }
  function toggleQuizHelp(force) {
    if (!quizHelpPanel) return;
    const show = typeof force === 'boolean' ? force : quizHelpPanel.style.display === 'none';
    quizHelpPanel.style.display = show ? '' : 'none';
    if (show && quizHelpMsgs && !quizHelpMsgs.children.length) {
      addQuizHelpMsg('bot', `Stuck on Q${quizIndex + 1}? Ask me anything — I'll nudge you to it, never spoil it. 🎯`);
    }
    if (show) {
      if (quizHelpInput) quizHelpInput.focus();
      // Bring the whole panel into view so nothing sits cut off under the fold.
      setTimeout(() => {
        try { quizHelpPanel.scrollIntoView({ behavior: 'smooth', block: 'end' }); }
        catch (e) {}
      }, 60);
    }
  }
  if (quizHelpBtn) quizHelpBtn.addEventListener('click', () => toggleQuizHelp());
  if (quizHelpClose) quizHelpClose.addEventListener('click', () => toggleQuizHelp(false));

  function noteQuizHelpNewQuestion() {
    if (!quizHelpMsgs || !quizHelpMsgs.children.length) return;
    if (quizHelpPanel && quizHelpPanel.style.display === 'none') return;
    addQuizHelpMsg('bot', `<em>— now on Q${quizIndex + 1}: ${escapeHtml(String(quizQuestions[quizIndex]?.q || '').slice(0, 80))}… —</em>`);
  }
  function noteQuizHelpResult(pct) {
    if (!quizHelpMsgs) return;
    if (quizHelpPanel) quizHelpPanel.style.display = '';
    addQuizHelpMsg('bot', pct >= 50
      ? `Quiz done — nice work! Ask me to explain any question in detail. 📚`
      : `Quiz done — let's fix the gaps. Ask me about any question. 💪`);
  }

  function quizHelpSystem() {
    const q = quizQuestions[quizIndex] || {};
    const letters = ['A', 'B', 'C', 'D'];
    const opts = (q.options || []).map((o, i) => `${letters[i]}) ${o}`).join(' | ');
    return `You are Hint Buddy, a Socratic tutor inside a quiz on "${quizTopicLabel}".
Current question (Q${quizIndex + 1}): "${q.q || ''}"
Options: ${opts}
Correct: ${letters[q.answer] || '?'} — explanation: ${q.explain || ''} — trap: ${q.trap || ''}
HARD RULES: NEVER state the correct option letter/text or the final numeric answer. Nudge instead: recall the rule/formula (leave a blank to fill), eliminate ONE wrong option with reasoning, or ask a leading question. Under 80 words. KaTeX \\( \\) for math.`;
  }

  async function sendQuizHelp(text) {
    const msg = String(text || '').trim();
    if (!msg || quizHelpBusy || !quizQuestions.length) return;
    if (quizHelpPanel && quizHelpPanel.style.display === 'none') toggleQuizHelp(true);
    quizHelpBusy = true;
    addQuizHelpMsg('user', msg);
    quizHelpHistory.push({ role: 'user', content: msg });
    if (quizHelpInput) quizHelpInput.value = '';
    const thinking = document.createElement('div');
    thinking.className = 'quiz-help-msg bot thinking';
    thinking.textContent = 'Thinking…';
    if (quizHelpMsgs) { quizHelpMsgs.appendChild(thinking); quizHelpScroll(); }
    try {
      const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' };
      const payload = {
        model: getActiveAiModel(),
        messages: [
          { role: 'system', content: quizHelpSystem() },
          ...quizHelpHistory.slice(-6)
        ],
        stream: false,
        temperature: 0.5,
        max_tokens: 2000,
        reasoning_effort: 'low'
      };
      let resp = await fetch(getActiveAiApiUrl(), { method: 'POST', headers, body: JSON.stringify(payload) });
      if (!resp.ok && getActiveAiApiFallbackUrl()) {
        resp = await fetch(getActiveAiApiFallbackUrl(), { method: 'POST', headers, body: JSON.stringify(payload) });
      }
      if (!resp.ok) {
        if (resp.status === 404) healDeadModel();
        throw new Error(`API error ${resp.status}`);
      }
      const data = await resp.json();
      const reply = (data.choices?.[0]?.message?.content || '').trim() || "Hmm, that didn't come through — ask again! 🤔";
      thinking.remove();
      addQuizHelpMsg('bot', mdToHtml(reply));
      quizHelpHistory.push({ role: 'assistant', content: reply });
    } catch (err) {
      thinking.remove();
      addQuizHelpMsg('bot', err && err.message === 'key'
        ? 'AI Gateway is momentarily unavailable. Please try again shortly.'
        : 'Brain glitch — try that question again in a few seconds. ⚡');
    } finally {
      quizHelpBusy = false;
    }
  }
  if (quizHelpSend) quizHelpSend.addEventListener('click', () => quizHelpInput && sendQuizHelp(quizHelpInput.value));
  if (quizHelpInput) {
    quizHelpInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendQuizHelp(quizHelpInput.value);
    });
  }

  async function generateQuiz(rawTopic, qCount) {
    const activeChip = quickChips ? quickChips.querySelector('.fc-chip.active') : null;
    const activeChipSubj = activeChip ? activeChip.dataset.subject : '';
    const subjData = updateSubjectContextBadge(rawTopic || activeChipSubj || 'PPS');
    let cleanTopic = (rawTopic || '').trim();
    const prefixRegex = new RegExp(`^(${subjData.alias}|${subjData.alias.replace(' Viva', '')}):\\s*`, 'i');
    if (prefixRegex.test(cleanTopic)) cleanTopic = cleanTopic.replace(prefixRegex, '').trim();
    if (!cleanTopic) cleanTopic = (rawTopic || '').trim();
    if (!cleanTopic || /^[a-zA-Z\s]+:\s*$/.test(rawTopic || '')) {
      showToast('Type a topic to quiz on (e.g. BEE: Thevenin)!');
      if (quizTopicInput) quizTopicInput.focus();
      return;
    }
    if (quizGenerateBtn) {
      quizGenerateBtn.disabled = true;
      quizGenerateBtn.textContent = '⏳ Forging quiz…';
    }
    if (quizStatus) {
      quizStatus.style.display = 'inline-flex';
      quizStatus.innerHTML = `<span class="fc-stream-dot"></span><span>Forging ${qCount} questions on ${escapeHtml(cleanTopic)}…</span>`;
    }
    try {
      const qs = await fetchQuizQuestions(subjData, cleanTopic, qCount);
      quizQuestions = qs;
      quizIndex = 0;
      quizScore = 0;
      quizTopicLabel = `${subjData.alias}: ${cleanTopic}`;
      if (quizPageTitle) quizPageTitle.textContent = `⚡ ${quizTopicLabel}`;
      openQuizPage();
      renderQuizQ();
      if (quizStatus) quizStatus.style.display = 'none';
    } catch (err) {
      console.error('Quiz generation error:', err);
      // Never leak raw parser gibberish ("Unexpected token...") to the UI.
      const rawMsg = String((err && err.message) || 'Quiz failed');
      const friendly = /Unexpected token|not valid JSON|QUIZ_GARBLED|malformed|Empty quiz/i.test(rawMsg)
        ? 'Quiz came back garbled'
        : rawMsg;
      if (quizStatus) {
        quizStatus.style.display = 'inline-flex';
        quizStatus.innerHTML = `<span>⚠️ ${escapeHtml(friendly)} — try again.</span>`;
      }
      showToast(`Quiz error: ${friendly}`);
    } finally {
      if (quizGenerateBtn) {
        quizGenerateBtn.disabled = false;
        quizGenerateBtn.textContent = '🎯 Start Quiz';
      }
    }
  }
  if (quizGenerateBtn) {
    quizGenerateBtn.addEventListener('click', () => {
      const topic = quizTopicInput ? quizTopicInput.value.trim() : '';
      const count = quizCountSelect ? (parseInt(quizCountSelect.value, 10) || 5) : 5;
      generateQuiz(topic, count);
    });
  }
  if (quizTopicInput) {
    quizTopicInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && quizGenerateBtn) quizGenerateBtn.click();
    });
  }

  renderQuizHistory();
  renderQuizHelpChips();
  renderDeckList();
}

// ─── Hold-to-select ───
// Text is locked app-wide. A press-and-hold of 2s (no move) unlocks
// selection and auto-selects the word/block under the finger.
// Short taps can never select anything. Inputs stay natively editable.
var HOLD_SELECT_MS = 2000;
var HOLD_MOVE_PX = 12;
var holdTimer = null;
var holdPoint = null;
var holdJustFired = false;

function holdClearTimer() {
  if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
  holdPoint = null;
}

function holdTargetOk(target) {
  if (!target || !target.closest) return false;
  if (target.closest("input, textarea, select, [contenteditable], a, button, [role='button']")) return false;
  return true;
}

function onHoldDown(e) {
  holdClearTimer();
  holdJustFired = false;
  try {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return; // active selection: let the user adjust/copy
  } catch (err) { /* ignore */ }
  document.body.classList.remove("allow-select");
  if (e.isPrimary === false) return;
  if (e.button !== undefined && e.button > 0) return;
  if (!holdTargetOk(e.target)) return;
  holdPoint = { x: e.clientX, y: e.clientY };
  holdTimer = setTimeout(fireHoldSelect, HOLD_SELECT_MS);
}

function onHoldMove(e) {
  if (!holdTimer || !holdPoint) return;
  const dx = e.clientX - holdPoint.x;
  const dy = e.clientY - holdPoint.y;
  if (dx * dx + dy * dy > HOLD_MOVE_PX * HOLD_MOVE_PX) holdClearTimer();
}

function onHoldEnd() {
  holdClearTimer();
  holdPoint = null;
}

function fireHoldSelect() {
  holdTimer = null;
  if (!holdPoint) return;
  holdJustFired = true;
  document.body.classList.add("allow-select");
  try {
    if (navigator.vibrate) navigator.vibrate(25);
    const el = document.elementFromPoint ? document.elementFromPoint(holdPoint.x, holdPoint.y) : null;
    const block = (el && el.closest && el.closest(
      "p,h1,h2,h3,h4,li,.note-text,.ai-msg,.task-card,.goal-card,.tt-cell,.today-task,.today-line,.today-date,.stamp,.preview-item,.tt-now,.xp-label,.fc-card-front,.fc-card-back,.calendar-day"
    )) || el;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    let done = false;
    if (document.caretRangeFromPoint) {
      const pos = document.caretRangeFromPoint(holdPoint.x, holdPoint.y);
      if (pos && pos.startContainer) {
        sel.collapse(pos.startContainer, pos.startOffset);
        try {
          sel.modify("extend", "backward", "word");
          sel.modify("extend", "forward", "word");
          done = !sel.isCollapsed;
        } catch (err) { /* fallback to block select */ }
      }
    }
    if (!done && block && document.createRange) {
      const range = document.createRange();
      range.selectNodeContents(block);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } catch (err) { /* selection stays unlocked; user can drag */ }
  holdPoint = null;
}

document.addEventListener("pointerdown", onHoldDown, { passive: true });
document.addEventListener("pointermove", onHoldMove, { passive: true });
document.addEventListener("pointerup", onHoldEnd, { passive: true });
document.addEventListener("pointercancel", onHoldEnd, { passive: true });
// A 2s hold must not ALSO trigger the tap action on release (e.g. moving a task).
document.addEventListener("click", (event) => {
  if (holdJustFired) {
    holdJustFired = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);

// Late-layout insurance: re-pin to top once fonts/images settle (harmless if already there).
window.addEventListener("load", () => { scrollPageToTop(); });

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  scrollPageToTop();
  wireEvents();
  wireCalendarEvents();
  initBottomNav();
  initAskAI();
  initFlashcards();
  renderAll();
  updateGoalProgressLabel();
  initTheme();
  if (typeof renderTimetable === "function") {
    setInterval(renderTimetable, 60000);
  }
  console.log("Study Forged Initialized");
});

function initTheme() {
  const themeBtn = document.getElementById('themeToggle');
  const savedTheme = localStorage.getItem('sf_theme');

  if (savedTheme === 'dark') {
    document.body.setAttribute('data-theme', 'dark');
    if (themeBtn) themeBtn.textContent = '☀️';
  }

  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const isDark = document.body.getAttribute('data-theme') === 'dark';
      if (isDark) {
        document.body.removeAttribute('data-theme');
        themeBtn.textContent = '🌙';
        localStorage.setItem('sf_theme', 'light');
      } else {
        document.body.setAttribute('data-theme', 'dark');
        themeBtn.textContent = '☀️';
        localStorage.setItem('sf_theme', 'dark');
      }
    });
  }
}
