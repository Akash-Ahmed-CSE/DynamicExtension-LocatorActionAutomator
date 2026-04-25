let automations = {};

// RESTORE STATE: Prevents loops from breaking when the Service Worker restarts
chrome.storage.local.get(["automations"], (result) => {
  if (result.automations) {
    automations = result.automations;
  }
});

function saveState() {
  chrome.storage.local.set({ automations });
}

function generateRandomString(length = 8) {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let retVal = "";
  for (let i = 0, n = charset.length; i < length; ++i) {
    retVal += charset.charAt(Math.floor(Math.random() * n));
  }
  return retVal;
}

// Helper to send loop status update to popup
function sendLoopStatusUpdate(tabId, currentLoop, totalLoops) {
  chrome.runtime.sendMessage({
    command: "update_loop_status",
    tabId: tabId,
    currentLoop: currentLoop,
    totalLoops: totalLoops
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // STOP
  if (message.command === "stop") {
    const tabId = message.tabId || sender.tab?.id;
    if (tabId && automations[tabId]) {
      automations[tabId].isActive = false;
      automations[tabId].processing = false;
      saveState();
    }
    sendResponse({ success: true });
    return true;
  }

  // GET STATE (for popup initialization)
  if (message.command === "get_state") {
    const tabId = message.tabId;
    if (tabId && automations[tabId]) {
      sendResponse({ state: automations[tabId] });
    } else {
      sendResponse({ state: null });
    }
    return true;
  }

  // START
  if (message.command === "start") {
    const tabId = message.tabId;

    const tasks = message.tasks.map(task => {
      if (task.action === "input_increment") {
        return {
          ...task,
          _currentIncrement: parseInt(task.incrementStart, 10) || 1
        };
      }
      return task;
    });

    automations[tabId] = {
      tasks,
      loop: Math.max(1, parseInt(message.loop, 10) || 1),
      currentLoop: 1,
      taskIndex: 0,
      isActive: true,
      processing: false
    };

    saveState();

    // Send initial loop status
    sendLoopStatusUpdate(tabId, automations[tabId].currentLoop, automations[tabId].loop);

    executeNextStep(tabId);
    sendResponse({ success: true });
    return true;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!automations[tabId]) return;
  
  // When page starts loading, ensure we stop current processing 
  // to allow the "complete" status to trigger the next step.
  if (changeInfo.status === "complete" && automations[tabId].isActive) {
    automations[tabId].processing = false;
    saveState();
    setTimeout(() => executeNextStep(tabId), 200); // Reduced delay; waitForElement handles the rest
  }
});

// MAIN EXECUTOR
async function executeNextStep(tabId) {
  const state = automations[tabId];
  if (!state || !state.isActive) return;

  // If already processing, don't start another instance
  if (state.processing) return;

  // Check if the tab is still loading
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "loading") {
      console.log("Tab is loading, waiting for completion...");
      return; 
    }
  } catch (e) {
    return; // Tab might be closed
  }

  state.processing = true;
  const taskIndex = state.taskIndex;
  let task = state.tasks[taskIndex];

  // HANDLE RANDOM STRING ACTION OR USE RANDOM CHECKBOX
  if (task.action === "random_string" || (task.action === "input" && task.useRandom)) {
    const requestedLength = parseInt(task.actionValue, 10);
    const finalLength = isNaN(requestedLength) || requestedLength <= 0 ? 5 : requestedLength;
    
    task = {
      ...task,
      action: "input",
      actionValue: generateRandomString(finalLength)
    };
  } else if (task.action === "input_increment" && task.useRandom) {
    const prefix = task.actionValue || "";
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    task = {
      ...task,
      action: "input",
      actionValue: prefix + randomNum
    };
  } 
  // HANDLE INCREMENT (only if not random)
  else if (task.action === "input_increment") {
    const prefix = task.actionValue || "";
    const num = task._currentIncrement++;

    state.tasks[taskIndex]._currentIncrement = task._currentIncrement;

    task = {
      ...task,
      action: "input",
      actionValue: prefix + num
    };
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      args: [task],
      func: async (task) => {
        // WAIT FOR ELEMENT
        const waitForElement = (type, value, timeout = 6000) => {
          return new Promise(resolve => {
            const start = Date.now();

            const check = () => {
              let el = null;

              try {
                switch (type) {
                  case "css":
                    el = document.querySelector(value);
                    break;
                  case "id":
                    el = document.getElementById(value.replace("#", ""));
                    break;
                  case "name":
                    el = document.getElementsByName(value)[0];
                    break;
                  case "xpath":
                    el = document.evaluate(
                      value,
                      document,
                      null,
                      XPathResult.FIRST_ORDERED_NODE_TYPE,
                      null
                    ).singleNodeValue;
                    break;
                }
              } catch (e) {}

              if (el && el.offsetParent !== null) {
                return resolve(el);
              }

              if (Date.now() - start > timeout) {
                return resolve(null);
              }

              setTimeout(check, 100);
            };

            check();
          });
        };

        let el = null;
        if (task.action !== "wait" && task.action !== "comment") {
          el = await waitForElement(task.locatorType, task.locatorValue);
          if (!el) {
            console.error("Element not found:", task.locatorValue);
            return;
          }
        }

        // STRONG INPUT SETTER
        const setValue = (element, value) => {
          element.focus();

          if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
            const prototype = element.tagName === "TEXTAREA" 
              ? window.HTMLTextAreaElement.prototype 
              : window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
            setter.call(element, value);
          } else {
            element.value = value;
          }

          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
          element.dispatchEvent(new Event("blur", { bubbles: true }));
        };

        console.log("Running task:", task);

        switch (task.action) {

          case "comment":
            // No operation, used for annotations
            break;

          case "click":
            el.click();
            break;

          case "select":
          case "input":
            if (el.tagName === "SELECT") {
              el.focus();
              let found = false;
              for (let i = 0; i < el.options.length; i++) {
                if (el.options[i].value == task.actionValue || el.options[i].text == task.actionValue) {
                  el.selectedIndex = i;
                  found = true;
                  break;
                }
              }
              if (!found) el.value = task.actionValue;
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
              el.dispatchEvent(new Event("blur", { bubbles: true }));
            } else {
              setValue(el, task.actionValue);

              setTimeout(() => {
                if (el.value !== task.actionValue) {
                  setValue(el, task.actionValue);
                }
              }, 300);
            }
            break;

          case "wait":
            await new Promise(r =>
              setTimeout(r, parseInt(task.actionValue) || 1000)
            );
            break;
        }
      }
    });

  } catch (err) {
    // If context is invalidated or port closed during a click, it's usually navigation.
    // We should move to the next task regardless.
    if (task.action !== "click") {
      console.error("Task failed:", err.message);
      state.processing = false;
      return; 
    }
    console.warn("Navigation detected during click.");
  }

  state.taskIndex++;
  state.processing = false;

  // Handle Loop Advancement / Completion immediately
  if (state.taskIndex >= state.tasks.length) {
    state.taskIndex = 0;
    state.currentLoop++;

    if (state.currentLoop > state.loop) {
      state.isActive = false;
      saveState();
      // Send final status update
      sendLoopStatusUpdate(tabId, state.loop, state.loop);

      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icon128.png'),
        title: 'Automation Finished',
        message: `Completed ${state.loop} loops successfully.`,
        priority: 2
      });
      chrome.runtime.sendMessage({ command: "automation_finished", tabId: tabId });
      return; // Exit immediately without waiting for the next timeout
    }
  }

  saveState();
  // Send status update after each task
  sendLoopStatusUpdate(tabId, state.currentLoop, state.loop);

  setTimeout(() => executeNextStep(tabId), 200);
}