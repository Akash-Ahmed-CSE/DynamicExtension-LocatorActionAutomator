let automations = {};

chrome.storage.local.get(["automations"], (result) => {
  if (result.automations) {
    automations = result.automations;
    Object.keys(automations).forEach(tabId => {
      if (automations[tabId]) {
        automations[tabId].processing = false;
      }
    });
    saveState();
  }
});

function saveState() {
  chrome.storage.local.set({ automations });
}

function broadcastStatus(tabId) {
  const state = automations[tabId];
  if (!state) return;

  // currentLoop is always 1-indexed for display:
  // - When running: which loop is currently executing (1 to loop)
  // - When stopped: how many loops were completed (0 to loop)
  const displayLoop = state.isActive ? state.currentLoop : state.completedLoops;

  chrome.runtime.sendMessage({
    command: "status_update",
    tabId: tabId,
    currentLoop: displayLoop,
    totalLoops: state.loop,
    isActive: state.isActive
  }).catch(() => { });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.command === "stop") {
    const tabId = message.tabId || sender.tab?.id;
    if (tabId && automations[tabId]) {
      automations[tabId].isActive = false;
      automations[tabId].processing = false;
      saveState();
      broadcastStatus(tabId);
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon128.png",
        title: "Automation Stopped",
        message: "Automation has been stopped."
      });
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.command === "start") {
    const tabId = message.tabId;
    automations[tabId] = {
      tasks: message.tasks,
      loop: message.loop,
      currentLoop: 1,      // 1-indexed: which loop is running now
      completedLoops: 0,   // how many loops have finished
      taskIndex: 0,        // which task we're on (0-indexed)
      isActive: true,
      tabId: tabId,
      processing: false
    };
    saveState();
    broadcastStatus(tabId);
    executeNextStep(tabId);
    sendResponse({ success: true });
    return true;
  }

  if (message.command === "get_status") {
    const tabId = message.tabId;
    const state = automations[tabId];
    if (state && state.isActive && state.processing) {
      state.processing = false;
      saveState();
    }
    const isActive = !!(state && state.isActive);
    const displayLoop = isActive ? state?.currentLoop : state?.completedLoops;
    sendResponse({
      isActive,
      currentLoop: displayLoop ?? 0,
      totalLoops: state?.loop || 0,
      currentTaskIndex: state?.taskIndex || 0,
      totalTasks: state?.tasks?.length || 0
    });
    return true;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (automations[tabId] && changeInfo.status === "loading") {
    automations[tabId].processing = false;
    saveState();
  }

  if (changeInfo.status === "complete" && automations[tabId]?.isActive) {
    if (automations[tabId].processing) {
      automations[tabId].processing = false;
      saveState();
    }
    setTimeout(() => {
      executeNextStep(tabId);
    }, 1000);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (automations[tabId]) {
    delete automations[tabId];
    saveState();
  }
});

async function executeNextStep(tabId) {
  const state = automations[tabId];
  if (!state || !state.isActive) return;

  if (state.processing) {
    state.processing = false;
    saveState();
  }

  if (state.processing) return;

  // Check if all tasks in current loop are done
  if (state.taskIndex >= state.tasks.length) {
    // Current loop is complete
    state.completedLoops = state.currentLoop;
    state.taskIndex = 0;
    state.currentLoop++;

    // Check if we've completed all loops
    if (state.currentLoop > state.loop) {
      state.isActive = false;
      state.processing = false;
      saveState();
      broadcastStatus(tabId);
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon128.png",
        title: "Automation Complete",
        message: `Finished ${state.loop} loops.`
      });
      return;
    }

    saveState();
    broadcastStatus(tabId);
  }

  state.processing = true;
  const taskIndex = state.taskIndex;
  const task = state.tasks[taskIndex];

  state.taskIndex++;
  saveState();
  broadcastStatus(tabId);

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      args: [task],
      func: (task) => {
        if (task.action === "wait") {
          return { status: "wait", time: parseInt(task.actionValue, 10) || 1000 };
        }

        const getElement = (type, value) => {
          if (!value) return null;
          try {
            switch (type) {
              case "css": return document.querySelector(value);
              case "id": return document.getElementById(value.replace(/^#/, ""));
              case "name": return document.getElementsByName(value)[0];
              case "xpath":
                return document.evaluate(value, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
              default: return null;
            }
          } catch (e) { return null; }
        };

        const simulateTyping = (element, value) => {
          element.focus();
          element.value = "";
          element.dispatchEvent(new Event("input", { bubbles: true }));
          for (const char of value) {
            element.value += char;
            element.dispatchEvent(new InputEvent("input", { bubbles: true, data: char }));
          }
          element.dispatchEvent(new Event("change", { bubbles: true }));
        };

        const generateRandomString = () => {
          const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
          let result = "";
          for (let i = 0; i < 5; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          return result;
        };

        const el = getElement(task.locatorType, task.locatorValue);

        console.log("Executing task:", task.action, task.locatorValue);

        switch (task.action) {
          case "click":
            if (el) {
              el.click();
              return { status: "clicked" };
            }
            return { status: "element_not_found" };
          case "input":
            if (el) {
              simulateTyping(el, task.actionValue);
              return { status: "input_done" };
            }
            return { status: "element_not_found" };
          case "random_string":
            if (el) {
              simulateTyping(el, generateRandomString());
              return { status: "input_done" };
            }
            return { status: "element_not_found" };
          case "select":
            if (el) {
              el.value = task.actionValue;
              el.dispatchEvent(new Event("change", { bubbles: true }));
              return { status: "select_done" };
            }
            return { status: "element_not_found" };
          default:
            return { status: "unknown_action" };
        }
      }
    }).then(async (results) => {
      const result = results[0].result;

      if (result.status === "wait") {
        await new Promise(r => setTimeout(r, result.time));
      } else {
        await new Promise(r => setTimeout(r, 800));
      }

      state.processing = false;
      saveState();

      chrome.tabs.get(tabId, (tab) => {
        if (!chrome.runtime.lastError && tab.status === "complete" && state.isActive) {
          executeNextStep(tabId);
        }
      });
    });
  } catch (err) {
    console.error("Script execution error:", err);
    if (automations[tabId]) {
      automations[tabId].processing = false;
      saveState();
    }
  }
}