let fieldCount = 0;
const locatorSection = document.getElementById("locator-section");
const resetButton = document.getElementById("reset");
const importBtn = document.getElementById("import");
const exportBtn = document.getElementById("export");
const fileInput = document.getElementById("file-input");
const statusMessage = document.getElementById("status-message");
const actionBtn = document.getElementById("action-btn");
const loopStatusEl = document.getElementById("loop-status");
const loopCountInput = document.getElementById("loop-count");

// Initialize with one empty row
addLocatorRow();

function showStatusMessage(message, type = 'success') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
  statusMessage.style.display = 'block';

  // Hide the message after 3 seconds
  setTimeout(() => {
    statusMessage.style.display = 'none';
  }, 3000);
}

function updateLoopStatus(currentLoop, totalLoops) {
  if (totalLoops === 0) {
    loopStatusEl.textContent = "Loop: 0 / 0";
    loopStatusEl.classList.remove('running');
    return;
  }

  // Ensure we don't show currentLoop > totalLoops
  const displayLoop = Math.min(currentLoop, totalLoops);
  loopStatusEl.textContent = `Loop: ${displayLoop} / ${totalLoops}`;

  if (displayLoop > 0 && displayLoop <= totalLoops) {
    loopStatusEl.classList.add('running');
  } else {
    loopStatusEl.classList.remove('running');
  }
}

function setRunningState(running, currentLoop = 0, totalLoops = 0) {
  if (running) {
    actionBtn.textContent = "Stop";
    actionBtn.classList.remove("start-state");
    actionBtn.classList.add("stop-state");
    loopCountInput.disabled = true;
    updateLoopStatus(currentLoop, totalLoops);
    showStatusMessage('Automation running...', 'running');
  } else {
    actionBtn.textContent = "Start";
    actionBtn.classList.remove("stop-state");
    actionBtn.classList.add("start-state");
    loopCountInput.disabled = false;
    updateLoopStatus(currentLoop, totalLoops);
  }
}

function createLocatorRow(task = {}) {
  const row = document.createElement("div");
  row.className = "row";
  // Tight layout: checkbox right before buttons
  row.innerHTML = `
    <select class="locatorType">
      <option value="css">CSS</option>
      <option value="id">ID</option>
      <option value="name">Name</option>
      <option value="xpath">XPath</option>
    </select>
    <input class="locatorValue" placeholder="Locator">
    <select class="action">
      <option value="click">Click</option>
      <option value="input">Input</option>
      <option value="random_string">Random String</option>
      <option value="input_increment">Input String + Increment</option>
      <option value="select">Select</option>
      <option value="wait">Wait</option>
    </select>
    <input class="actionValue" placeholder="Value (for input/select)" style="display:none; min-width: 75px; max-width: 85px;">
    <input class="waitTime" type="number" placeholder="Wait (ms)" min="0" style="display:none; min-width: 60px; max-width: 70px;">
    <input class="incrementStart" type="number" placeholder="Start #" min="0" style="display:none; min-width: 50px; max-width: 55px;">
    <label class="random-checkbox-label" style="display:none;">
      <input type="checkbox" class="random-checkbox" title="Use random 5-digit number instead of increment">
      <span>Rand</span>
    </label>
    <div class="row-actions">
      <button class="remove-field-button">-</button>
      <button class="add-field-button">+</button>
    </div>
  `;

  // Set values if task is provided
  if (task.locatorType) {
    row.querySelector(".locatorType").value = task.locatorType;
  }
  if (task.locatorValue) {
    row.querySelector(".locatorValue").value = task.locatorValue;
  }
  if (task.action) {
    row.querySelector(".action").value = task.action;
  }
  if (task.actionValue) {
    if (task.action === "wait") {
      row.querySelector(".waitTime").value = task.actionValue;
    } else if (["input", "select", "input_increment", "random_string"].includes(task.action)) {
      row.querySelector(".actionValue").value = task.actionValue;
    }
  }
  if (task.incrementStart !== undefined && task.incrementStart !== "") {
    row.querySelector(".incrementStart").value = task.incrementStart;
  }
  if (task.useRandom) {
    row.querySelector(".random-checkbox").checked = true;
  }

  const locatorTypeDropdown = row.querySelector(".locatorType");
  const locatorValueInput = row.querySelector(".locatorValue");
  const actionDropdown = row.querySelector(".action");
  const actionValueInput = row.querySelector(".actionValue");
  const waitTimeInput = row.querySelector(".waitTime");
  const incrementStartInput = row.querySelector(".incrementStart");
  const randomCheckboxLabel = row.querySelector(".random-checkbox-label");

  function toggleInputs() {
    const action = actionDropdown.value;

    if (action === "wait") {
      locatorTypeDropdown.disabled = true;
      locatorValueInput.disabled = true;
      locatorValueInput.style.backgroundColor = "#eee";
      actionValueInput.style.display = "none";
      waitTimeInput.style.display = "inline-block";
      incrementStartInput.style.display = "none";
      randomCheckboxLabel.style.display = "none";
    } else if (action === "input_increment") {
      locatorTypeDropdown.disabled = false;
      locatorValueInput.disabled = false;
      locatorValueInput.style.backgroundColor = "";
      waitTimeInput.style.display = "none";
      actionValueInput.style.display = "inline-block";
      actionValueInput.placeholder = "Prefix";
      incrementStartInput.style.display = "inline-block";
      randomCheckboxLabel.style.display = "flex";
    } else {
      locatorTypeDropdown.disabled = false;
      locatorValueInput.disabled = false;
      locatorValueInput.style.backgroundColor = "";
      waitTimeInput.style.display = "none";
      incrementStartInput.style.display = "none";
      randomCheckboxLabel.style.display = "none";

      if (action === "input" || action === "select") {
        actionValueInput.style.display = "inline-block";
        actionValueInput.placeholder = "Value";
      } else if (action === "random_string") {
        actionValueInput.style.display = "inline-block";
        actionValueInput.placeholder = "Length (def: 5)";
      } else {
        actionValueInput.style.display = "none";
      }
    }
  }

  toggleInputs();
  actionDropdown.addEventListener("change", toggleInputs);

  return row;
}

function addLocatorRow(task = null, referenceRow = null) {
  const row = createLocatorRow(task || {});

  // Add button functionality
  row.querySelector(".add-field-button").addEventListener("click", (e) => {
    e.stopPropagation();
    addLocatorRow(null, row);
  });

  // Remove button functionality
  row.querySelector(".remove-field-button").addEventListener("click", (e) => {
    e.stopPropagation();
    if (locatorSection.children.length > 1) {
      locatorSection.removeChild(row);
      fieldCount--;
    }
  });

  if (referenceRow) {
    referenceRow.after(row);
  } else {
    locatorSection.appendChild(row);
  }

  fieldCount++;
}

// Import functionality
importBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const tasks = JSON.parse(text);
    loadTasks(tasks);
    showStatusMessage(`Successfully imported ${tasks.length} task(s)`);
  } catch (error) {
    console.error("Error importing file:", error);
    showStatusMessage("Error importing file. Please check the file format.", "error");
  }

  fileInput.value = '';
});

// Export functionality
exportBtn.addEventListener("click", () => {
  const tasks = getCurrentTasks();
  if (tasks.length === 0) {
    showStatusMessage("No tasks to export!", "error");
    return;
  }

  const jsonData = JSON.stringify(tasks, null, 2);
  const blob = new Blob([jsonData], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "automation-tasks.json";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);

  showStatusMessage(`Successfully exported ${tasks.length} task(s)`);
});

function getCurrentTasks() {
  const tasks = [];
  document.querySelectorAll(".row").forEach((row) => {
    const locatorTypeEl = row.querySelector(".locatorType");
    const locatorValueEl = row.querySelector(".locatorValue");
    const actionEl = row.querySelector(".action");
    const actionValueEl = row.querySelector(".actionValue");
    const waitTimeEl = row.querySelector(".waitTime");
    const incrementStartEl = row.querySelector(".incrementStart");
    const randomCheckboxEl = row.querySelector(".random-checkbox");

    if (!locatorTypeEl || !locatorValueEl || !actionEl) return;

    const locatorType = locatorTypeEl.value;
    const locatorValue = locatorValueEl.value;
    const action = actionEl.value;

    let actionValue = "";
    let incrementStart = "";
    let useRandom = false;

    if (["input", "select", "input_increment", "random_string"].includes(action)) {
      actionValue = actionValueEl.value;
    } else if (action === "wait") {
      actionValue = waitTimeEl.value;
    }

    if (action === "input_increment") {
      incrementStart = incrementStartEl.value;
      useRandom = randomCheckboxEl.checked;
    }

    tasks.push({ locatorType, locatorValue, action, actionValue, incrementStart, useRandom });
  });
  return tasks;
}

function loadTasks(tasks) {
  locatorSection.innerHTML = "";
  fieldCount = 0;

  tasks.forEach(task => addLocatorRow(task));

  if (tasks.length === 0) addLocatorRow();
}

// Reset functionality
resetButton.addEventListener("click", () => {
  locatorSection.innerHTML = "";
  fieldCount = 0;
  addLocatorRow();
  loopCountInput.value = "";
  updateLoopStatus(0, 0);
  showStatusMessage("UI reset successfully");
});

// Single action button handler (Start / Stop toggle)
actionBtn.onclick = async () => {
  const isRunning = actionBtn.classList.contains("stop-state");

  if (isRunning) {
    // Stop action
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    chrome.runtime.sendMessage({
      command: "stop",
      tabId: tab.id,
    });

    setRunningState(false);
    showStatusMessage("Automation stopped", "error");
  } else {
    // Start action
    const loopVal = parseInt(loopCountInput.value);
    const loop = isNaN(loopVal) || loopVal < 1 ? 1 : loopVal;
    const tasks = getCurrentTasks();

    if (tasks.length === 0) {
      showStatusMessage("Please provide at least one valid locator or wait action", "error");
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    setRunningState(true, 1, loop);

    chrome.runtime.sendMessage({
      command: "start",
      tabId: tab.id,
      tasks,
      loop,
    });
  }
};

// Listen for status updates from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.command === "update_loop_status") {
    updateLoopStatus(message.currentLoop, message.totalLoops);
  } else if (message.command === "automation_finished") {
    setRunningState(false, 0, 0);
    showStatusMessage("Automation finished successfully");
  }
});

// Check if automation is running for current tab when popup opens
async function checkRunningState() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.runtime.sendMessage({ command: "get_state", tabId: tab.id }, (response) => {
      if (response?.state?.isActive) {
        setRunningState(true, response.state.currentLoop, response.state.loop);
        return;
      }
      setRunningState(false);
    });
  } catch (e) {
    setRunningState(false);
  }
}

// Initialize button states
setRunningState(false);

// Check status on popup load
checkRunningState();

// Update loop display when loop count input changes
loopCountInput.addEventListener("input", () => {
  const val = parseInt(loopCountInput.value);
  if (!isNaN(val) && val > 0) {
    updateLoopStatus(0, val);
  } else {
    updateLoopStatus(0, 0);
  }
});