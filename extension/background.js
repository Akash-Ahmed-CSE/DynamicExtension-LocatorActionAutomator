let isStopped = false;
let activeTabId = null;

// Enhanced automation executor
async function executeAutomation(tabId, tasks, loop) {
  try {
    // First inject helper functions
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Clear stop flag
        localStorage.removeItem("__automationStopped__");
        
        // Store helpers in window
        window.__automationHelpers = {
          getElement: (type, value, maxAttempts = 5) => {
            let attempts = 0;
            const tryGet = () => {
              try {
                switch (type) {
                  case "css": return document.querySelector(value);
                  case "id": return document.getElementById(value);
                  case "name": return document.getElementsByName(value)[0];
                  case "xpath": 
                    return document.evaluate(value, document, null, 
                            XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                  default: return null;
                }
              } catch (e) {
                if (++attempts >= maxAttempts) {
                  console.error("Element not found after", maxAttempts, "attempts");
                  return null;
                }
                return new Promise(resolve => 
                  setTimeout(() => resolve(tryGet()), 500)
                );
              }
            };
            return tryGet();
          },
          simulateTyping: (element, value) => {
            element.focus();
            element.value = "";
            element.dispatchEvent(new Event("input", { bubbles: true }));
            for (const char of value) {
              element.value += char;
              element.dispatchEvent(new InputEvent("input", { bubbles: true, data: char }));
            }
            element.dispatchEvent(new Event("change", { bubbles: true }));
          },
          delay: (ms) => new Promise(res => setTimeout(res, ms)),
          generateRandomString: () => Math.random().toString(36).substring(2, 10),
          waitForReady: async () => {
            if (document.readyState !== 'complete') {
              await new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve, { once: true });
              });
            }
            // Additional framework-specific checks
            if (window.angular) {
              await new Promise(resolve => {
                const check = () => {
                  if (window.angular.getTestability) return resolve();
                  setTimeout(check, 100);
                };
                check();
              });
            }
            if (window.React) {
              await new Promise(resolve => {
                const check = () => {
                  if (document.querySelector('[data-reactroot]')) return resolve();
                  setTimeout(check, 1000);
                };
                check();
              });
            }
          }
        };
      },
      world: "MAIN"
    });

    // Execute the tasks
    await chrome.scripting.executeScript({
      target: { tabId },
      func: async (tasks, loop) => {
        await window.__automationHelpers.waitForReady();
        
        for (let i = 0; i < loop; i++) {
          if (localStorage.getItem("__automationStopped__")) break;
          
          for (const task of tasks) {
            if (localStorage.getItem("__automationStopped__")) break;
            
            try {
              if (task.action === "wait") {
                await window.__automationHelpers.delay(parseInt(task.actionValue) || 1000);
                continue;
              }

              const el = await window.__automationHelpers.getElement(
                task.locatorType, 
                task.locatorValue
              );
              
              if (!el) {
                console.warn('Element not found', task);
                continue;
              }

              // Bring element into view (for lazy-loaded content)
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              await window.__automationHelpers.delay(300);

              switch (task.action) {
                case "click":
                  el.click();
                  break;
                case "input":
                  window.__automationHelpers.simulateTyping(el, task.actionValue);
                  break;
                case "random_string":
                  const randomStr = window.__automationHelpers.generateRandomString();
                  window.__automationHelpers.simulateTyping(el, randomStr);
                  break;
                case "select":
                  el.value = task.actionValue;
                  el.dispatchEvent(new Event("change", { bubbles: true }));
                  break;
              }
              
              await window.__automationHelpers.delay(300); // Short delay between actions
            } catch (error) {
              console.error('Task failed:', task, error);
              await window.__automationHelpers.delay(1000); // Recovery delay
            }
          }
        }
        
        chrome.runtime.sendMessage({ type: "automation-complete" });
      },
      args: [tasks, loop],
      world: "MAIN"
    });
  } catch (error) {
    console.error("Automation error:", error);
    chrome.tabs.sendMessage(tabId, {
      type: "execution-error",
      error: error.message
    });
    
    // Retry if it's an injection error
    if (error.message.includes("Cannot access contents")) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return executeAutomation(tabId, tasks, loop);
    }
  }
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.command === "stop") {
    isStopped = true;
    activeTabId = null;
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      func: () => localStorage.setItem("__automationStopped__", "true"),
      world: "MAIN"
    });
    return;
  }

  if (message.command === "start") {
    isStopped = false;
    activeTabId = message.tabId;
    
    // Ensure tab is focused and ready
    chrome.tabs.update(message.tabId, { active: true }, async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      executeAutomation(message.tabId, message.tasks, message.loop);
    });
  }
});

// Handle page navigation
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (activeTabId && details.tabId === activeTabId && !isStopped) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: details.tabId },
        func: () => {
          if (window.__automationHelpers) {
            localStorage.removeItem("__automationStopped__");
            return true;
          }
          return false;
        },
        world: "MAIN"
      });
    } catch (error) {
      console.log("Re-injecting helpers after navigation...");
      // Helpers were lost during navigation, re-inject them
      if (activeTabId) {
        await chrome.scripting.executeScript({
          target: { tabId: activeTabId },
          files: ['content.js'],
          world: "MAIN"
        });
      }
    }
  }
}, { url: [{ urlMatches: 'http://*/*' }, { urlMatches: 'https://*/*' }]});