/* ═══════════════════════════════════════════════
   LOCATOR ACTION AUTOMATOR — popup.js
   ═══════════════════════════════════════════════ */

let fieldCount = 0;

const locatorSection = document.getElementById("locator-section");
const emptyHint = document.getElementById("empty-hint");
const resetButton = document.getElementById("reset");
const importBtn = document.getElementById("import");
const exportBtn = document.getElementById("export");
const addFirstBtn = document.getElementById("add-first");
const fileInput = document.getElementById("file-input");
const statusMessage = document.getElementById("status-message");
const actionBtn = document.getElementById("action-btn");
const actionBtnLabel = document.getElementById("action-btn-label");
const loopStatusEl = document.getElementById("loop-status");
const loopCountInput = document.getElementById("loop-count");
const stepCountPill = document.getElementById("step-count-pill");
const progressBar = document.getElementById("progress-bar");

// ── Action → colour map ────────────────────────────────────────────────────────
const ACTION_COLORS = {
  click: "#3ecf8e",   // green
  input: "#5c72f0",   // accent blue
  random_string: "#a060f0",   // purple
  input_increment: "#40c4d8",   // cyan
  select: "#f0a040",   // amber
  wait: "#f06060",   // red
  comment: "#94a3b8", // slate grey
};

// ── Init ──────────────────────────────────────────────────────────────────────
addLocatorRow();
updateEmptyHint();

// ══════════════════════════════════════════════
//  STEP COUNT + EMPTY HINT
// ══════════════════════════════════════════════
function updateEmptyHint() {
  const count = locatorSection.querySelectorAll(".row").length;
  stepCountPill.textContent = `${count} Step${count !== 1 ? "s" : ""}`;
  emptyHint.style.display = count === 0 ? "block" : "none";
}

// ══════════════════════════════════════════════
//  PROGRESS BAR
// ══════════════════════════════════════════════
function setProgress(current, total) {
  progressBar.classList.remove("indeterminate");
  if (total === 0) {
    progressBar.style.width = "0%";
    return;
  }
  progressBar.style.width = Math.min(100, Math.round((current / total) * 100)) + "%";
}

function setProgressIndeterminate(on) {
  if (on) {
    progressBar.classList.add("indeterminate");
    progressBar.style.width = "";
  } else {
    progressBar.classList.remove("indeterminate");
  }
}

// ══════════════════════════════════════════════
//  STATUS MESSAGE
// ══════════════════════════════════════════════
function showStatus(message, type = "success") {
  statusMessage.textContent = message;
  statusMessage.className = type;   // class drives the look
  statusMessage.style.display = "block";
  clearTimeout(statusMessage._t);
  statusMessage._t = setTimeout(() => {
    statusMessage.style.display = "none";
  }, 3800);
}

// ══════════════════════════════════════════════
//  LOOP STATUS
// ══════════════════════════════════════════════
function updateLoopStatus(currentLoop, totalLoops) {
  if (totalLoops === 0) {
    loopStatusEl.textContent = "0/0";
    loopStatusEl.classList.remove("running");
    setProgress(0, 0);
    return;
  }
  const disp = Math.min(currentLoop, totalLoops);
  loopStatusEl.textContent = `${disp}/${totalLoops}`;
  if (disp > 0 && disp <= totalLoops) {
    loopStatusEl.classList.add("running");
    setProgress(disp, totalLoops);
  } else {
    loopStatusEl.classList.remove("running");
    setProgress(0, totalLoops);
  }
}

// ══════════════════════════════════════════════
//  RUNNING STATE
// ══════════════════════════════════════════════
function setRunningState(running, currentLoop = 0, totalLoops = 0) {
  if (running) {
    actionBtnLabel.textContent = "X Stop";
    actionBtn.classList.replace("start-state", "stop-state");
    loopCountInput.disabled = true;
    updateLoopStatus(currentLoop, totalLoops);
    setProgressIndeterminate(totalLoops === 0);
    showStatus(">> Automation is running", "running");
  } else {
    actionBtnLabel.textContent = "> Start";
    actionBtn.classList.replace("stop-state", "start-state");
    loopCountInput.disabled = false;
    updateLoopStatus(currentLoop, totalLoops);
    setProgressIndeterminate(false);
  }
}

// ══════════════════════════════════════════════
//  RE-NUMBER ROWS
// ══════════════════════════════════════════════
function renumberRows() {
  locatorSection.querySelectorAll(".row").forEach((row, i) => {
    const el = row.querySelector(".row-num");
    if (el) el.textContent = String(i + 1).padStart(2, "0");
  });
  updateEmptyHint();
}

// ══════════════════════════════════════════════
//  UPDATE ACTION DOT COLOR
// ══════════════════════════════════════════════
function updateActionDot(row) {
  const action = row.querySelector(".action")?.value;
  const dot = row.querySelector(".action-dot");
  if (dot) dot.style.background = ACTION_COLORS[action] || "#555";
}

// ══════════════════════════════════════════════
//  CREATE ROW
// ══════════════════════════════════════════════
function createLocatorRow(task = {}) {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `
    <span class="row-num">01</span>
    <span class="action-dot" title="Action type indicator"></span>
    <select class="locatorType">
      <option value="css">CSS</option>
      <option value="id">ID</option>
      <option value="name">Name</option>
      <option value="xpath">XPath</option>
    </select>
    <input class="locatorValue" placeholder="Locator value" autocomplete="off" spellcheck="false">
    <select class="action">
      <option value="click">Click</option>
      <option value="input">Input</option>
      <option value="random_string">Random String</option>
      <option value="input_increment">Input + Increment</option>
      <option value="select">Select</option>
      <option value="wait">Wait</option>
      <option value="comment">Comment</option>
    </select>
    <input class="actionValue"    placeholder="Value / prefix"   style="display:none;" autocomplete="off" spellcheck="false">
    <input class="waitTime"       type="number" placeholder="ms"  style="display:none;" min="0">
    <input class="incrementStart" type="number" placeholder="Start #" style="display:none;" min="0">
    <label class="random-checkbox-label" style="display:none;" title="Use random 5-digit number instead of increment">
      <input type="checkbox" class="random-checkbox"> Rand
    </label>
    <div class="row-actions">
      <button class="row-btn btn-remove remove-field-button" title="Remove this step">-</button>
      <button class="row-btn btn-add    add-field-button"    title="Insert step below">+</button>
    </div>
  `;

  /* ── restore values ── */
  if (task.locatorType) row.querySelector(".locatorType").value = task.locatorType;
  if (task.locatorValue) row.querySelector(".locatorValue").value = task.locatorValue;
  if (task.action) row.querySelector(".action").value = task.action;
  if (task.actionValue) {
    if (task.action === "wait")
      row.querySelector(".waitTime").value = task.actionValue;
    else if (["input", "select", "input_increment", "random_string", "comment"].includes(task.action))
      row.querySelector(".actionValue").value = task.actionValue;
  }
  if (task.incrementStart !== undefined && task.incrementStart !== "")
    row.querySelector(".incrementStart").value = task.incrementStart;
  if (task.useRandom)
    row.querySelector(".random-checkbox").checked = true;

  /* ── refs ── */
  const ltSel = row.querySelector(".locatorType");
  const lvInp = row.querySelector(".locatorValue");
  const actSel = row.querySelector(".action");
  const avInp = row.querySelector(".actionValue");
  const wtInp = row.querySelector(".waitTime");
  const isInp = row.querySelector(".incrementStart");
  const rcLbl = row.querySelector(".random-checkbox-label");

  /* ── toggle visible fields ── */
  function toggleInputs() {
    const a = actSel.value;
    if (a === "wait") {
      ltSel.disabled = lvInp.disabled = true;
      avInp.style.display = isInp.style.display = rcLbl.style.display = "none";
      wtInp.style.display = "inline-block";
    } else if (a === "comment") {
      ltSel.disabled = lvInp.disabled = true;
      wtInp.style.display = isInp.style.display = rcLbl.style.display = "none";
      avInp.style.display = "inline-block";
      avInp.placeholder = "Enter note...";
    } else if (a === "input_increment") {
      ltSel.disabled = lvInp.disabled = false;
      wtInp.style.display = "none";
      avInp.style.display = isInp.style.display = "inline-block";
      avInp.placeholder = "Prefix";
      rcLbl.style.display = "flex";
    } else {
      ltSel.disabled = lvInp.disabled = false;
      wtInp.style.display = isInp.style.display = rcLbl.style.display = "none";
      if (a === "input" || a === "select") {
        avInp.style.display = "inline-block";
        avInp.placeholder = "Value";
      } else if (a === "random_string") {
        avInp.style.display = "inline-block";
        avInp.placeholder = "Length (def: 5)";
      } else {
        avInp.style.display = "none";
      }
    }
    updateActionDot(row);
  }

  toggleInputs();
  actSel.addEventListener("change", toggleInputs);
  return row;
}

// ══════════════════════════════════════════════
//  ADD ROW
// ══════════════════════════════════════════════
function addLocatorRow(task = null, referenceRow = null) {
  const row = createLocatorRow(task || {});

  row.querySelector(".add-field-button").addEventListener("click", e => {
    e.stopPropagation();
    addLocatorRow(null, row);
  });

  row.querySelector(".remove-field-button").addEventListener("click", e => {
    e.stopPropagation();
    if (locatorSection.querySelectorAll(".row").length <= 1) return;
    row.classList.add("row-removing");
    setTimeout(() => {
      row.remove();
      fieldCount--;
      renumberRows();
    }, 150);
  });

  if (referenceRow) referenceRow.after(row);
  else locatorSection.insertBefore(row, emptyHint);

  fieldCount++;
  renumberRows();
}

// ══════════════════════════════════════════════
//  COLLECT TASKS
// ══════════════════════════════════════════════
function getCurrentTasks() {
  const tasks = [];
  locatorSection.querySelectorAll(".row").forEach(row => {
    const ltEl = row.querySelector(".locatorType");
    const lvEl = row.querySelector(".locatorValue");
    const aEl = row.querySelector(".action");
    const avEl = row.querySelector(".actionValue");
    const wtEl = row.querySelector(".waitTime");
    const isEl = row.querySelector(".incrementStart");
    const rcEl = row.querySelector(".random-checkbox");
    if (!ltEl || !lvEl || !aEl) return;

    const action = aEl.value;
    let actionValue = "", incrementStart = "", useRandom = false;

    if (["input", "select", "input_increment", "random_string", "comment"].includes(action))
      actionValue = avEl.value;
    else if (action === "wait")
      actionValue = wtEl.value;

    if (action === "input_increment") {
      incrementStart = isEl.value;
      useRandom = rcEl.checked;
    }

    tasks.push({
      locatorType: ltEl.value,
      locatorValue: lvEl.value,
      action,
      actionValue,
      incrementStart,
      useRandom
    });
  });
  return tasks;
}

// ══════════════════════════════════════════════
//  LOAD TASKS
// ══════════════════════════════════════════════
function loadTasks(tasks) {
  locatorSection.querySelectorAll(".row").forEach(r => r.remove());
  fieldCount = 0;
  tasks.forEach(t => addLocatorRow(t));
  if (tasks.length === 0) addLocatorRow();
}

// ══════════════════════════════════════════════
//  IMPORT
// ══════════════════════════════════════════════
importBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const tasks = JSON.parse(await file.text());
    loadTasks(tasks);
    showStatus(`Imported ${tasks.length} step(s) from "${file.name}"`);
  } catch {
    showStatus("Import failed — invalid JSON format.", "error");
  }
  fileInput.value = "";
});

// ══════════════════════════════════════════════
//  EXPORT
// ══════════════════════════════════════════════
exportBtn.addEventListener("click", () => {
  const tasks = getCurrentTasks();
  if (!tasks.length) { showStatus("No steps to export.", "error"); return; }
  const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: "automation-tasks.json" });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
  showStatus(`Exported ${tasks.length} step(s)`);
});

// ══════════════════════════════════════════════
//  ADD FIRST / RESET
// ══════════════════════════════════════════════
addFirstBtn.addEventListener("click", () => addLocatorRow());

resetButton.addEventListener("click", () => {
  locatorSection.querySelectorAll(".row").forEach(r => r.remove());
  fieldCount = 0;
  addLocatorRow();
  loopCountInput.value = "";
  updateLoopStatus(0, 0);
  setProgress(0, 0);
  showStatus("Workspace cleared!");
});

// ══════════════════════════════════════════════
//  START / STOP
// ══════════════════════════════════════════════
async function handleStartStop() {
  const isRunning = actionBtn.classList.contains("stop-state");

  if (isRunning) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.runtime.sendMessage({ command: "stop", tabId: tab.id });
    setRunningState(false);
    setProgress(0, 0);
    showStatus("X Automation stopped!", "error");
  } else {
    const loopVal = parseInt(loopCountInput.value);
    const loop = isNaN(loopVal) || loopVal < 1 ? 1 : loopVal;
    const tasks = getCurrentTasks();
    if (!tasks.length) { showStatus("Add at least one step first.", "error"); return; }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    setRunningState(true, 1, loop);
    chrome.runtime.sendMessage({ command: "start", tabId: tab.id, tasks, loop });
  }
}

actionBtn.addEventListener("click", handleStartStop);

// Keyboard shortcut: Ctrl+Enter
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    handleStartStop();
  }
});

// ══════════════════════════════════════════════
//  BACKGROUND MESSAGES
// ══════════════════════════════════════════════
chrome.runtime.onMessage.addListener(msg => {
  if (msg.command === "update_loop_status") {
    updateLoopStatus(msg.currentLoop, msg.totalLoops);
  } else if (msg.command === "automation_finished") {
    setRunningState(false, 0, 0);
    setProgress(100, 100);
    showStatus(">> Automation completed successfully!");
    setTimeout(() => setProgress(0, 0), 2000);
  }
});

// ══════════════════════════════════════════════
//  RESTORE RUNNING STATE ON OPEN
// ══════════════════════════════════════════════
async function checkRunningState() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.runtime.sendMessage({ command: "get_state", tabId: tab.id }, res => {
      if (res?.state?.isActive) {
        setRunningState(true, res.state.currentLoop, res.state.loop);
      } else {
        setRunningState(false);
      }
    });
  } catch {
    setRunningState(false);
  }
}

setRunningState(false);
checkRunningState();

// ══════════════════════════════════════════════
//  LOOP COUNT LIVE PREVIEW
// ══════════════════════════════════════════════
loopCountInput.addEventListener("input", () => {
  const v = parseInt(loopCountInput.value);
  updateLoopStatus(0, !isNaN(v) && v > 0 ? v : 0);
});