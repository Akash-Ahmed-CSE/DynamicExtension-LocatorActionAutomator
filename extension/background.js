let isStopped = false;
let activeTabId = null;
let currentTasks = [];
let currentTaskIndex = 0;
let currentLoop = 1;
let lastNetworkActivity = Date.now();

// Helper functions to inject
const automationHelpers = {
  // Enhanced element location
  getElement: function(type, value, maxAttempts = 10) {
    const attempts = 0;
    const tryGet = async () => {
      try {
        let element;
        switch(type) {
          case 'css': 
            element = document.querySelector(value);
            break;
          case 'id':
            element = document.getElementById(value);
            break;
          case 'xpath':
            element = document.evaluate(
              value, 
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null
            ).singleNodeValue;
            break;
          default:
            return null;
        }
        
        // Additional visibility check
        if (element && this.isVisible(element)) {
          return element;
        }
        return null;
      } catch (error) {
        if (++attempts >= maxAttempts) throw error;
        await this.delay(300 + (attempts * 200));
        return tryGet();
      }
    };
    return tryGet();
  },

  // Visibility check with multiple criteria
  isVisible: function(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      element.offsetWidth > 0 &&
      element.offsetHeight > 0
    );
  },

  // Framework-aware waiting
  waitForAppReady: async function(timeout = 15000) {
    const startTime = Date.now();
    
    // 1. Basic DOM readiness
    if (document.readyState !== 'complete') {
      await new Promise(resolve => {
        const listener = () => {
          document.removeEventListener('DOMContentLoaded', listener);
          resolve();
        };
        document.addEventListener('DOMContentLoaded', listener);
        
        // Timeout fallback
        setTimeout(resolve, timeout - (Date.now() - startTime));
      });
    }

    // 2. Framework-specific checks
    if (window.React) {
      await new Promise(resolve => {
        const check = () => {
          // Check for React 18+ root
          const root = document.querySelector('#root,[data-reactroot]');
          if (root?._reactRootContainer) return resolve();
          
          // Fallback for older React
          if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.getRootNodes()?.length) {
            return resolve();
          }
          
          if (Date.now() - startTime > timeout) return resolve();
          setTimeout(check, 100);
        };
        check();
      });
    }

    // 3. Network idle detection
    await new Promise(resolve => {
      const check = () => {
        if (Date.now() - lastNetworkActivity > 2000) return resolve();
        setTimeout(check, 100);
      };
      check();
    });

    // 4. Visual readiness
    await new Promise(resolve => {
      const check = () => {
        if (this.isVisible('[data-testid="app-content"], .main-container')) {
          return resolve();
        }
        if (Date.now() - startTime > timeout) return resolve();
        setTimeout(check, 100);
      };
      check();
    });
  },

  // Other helper methods...
  simulateTyping: function(element, value) { /* ... */ },
  delay: function(ms) { /* ... */ },
  isInjected: true
};

// Network activity monitoring
chrome.webRequest.onCompleted.addListener(
  () => { lastNetworkActivity = Date.now(); },
  { urls: ["<all_urls>"] }
);

chrome.webRequest.onErrorOccurred.addListener(
  () => { lastNetworkActivity = Date.now(); },
  { urls: ["<all_urls>"] }
);

async function executeNextTask(tabId) {
  if (isStopped) return;

  // Verify helpers exist
  const helpersExist = await verifyHelpers(tabId);
  if (!helpersExist) {
    await injectHelpers(tabId);
  }

  // Task execution logic
  const task = currentTasks[currentTaskIndex];
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: async (task) => {
        await window.__automationHelpers.waitForAppReady();
        
        // Task processing logic
        const element = await window.__automationHelpers.getElement(
          task.locatorType,
          task.locatorValue,
          task.maxAttempts || 5
        );
        
        // Action handling
        switch(task.action) {
          case 'click':
            element.click();
            break;
          case 'input':
            // ... existing implementation
        }
      },
      args: [task],
      world: "MAIN"
    });

    currentTaskIndex++;
    if (currentTaskIndex >= currentTasks.length) {
      // Loop handling
    }

    executeNextTask(tabId);
  } catch (error) {
    // Error handling with retries
  }
}

// Navigation handling
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (shouldHandleNavigation(details)) {
    await handleNavigation(details.tabId);
  }
});

async function handleNavigation(tabId) {
  // 1. Wait for navigation completion
  await new Promise(resolve => {
    const listener = (tabId, changeInfo) => {
      if (changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener, { tabId });
  });

  // 2. Re-inject helpers
  await injectHelpers(tabId);

  // 3. Wait for app readiness
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.__automationHelpers.waitForAppReady(),
    world: "MAIN"
  });

  // 4. Resume execution
  executeNextTask(tabId);
}

// Initialization
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.command === 'start') {
    initializeAutomation(message, sender.tab.id);
  }
});

async function initializeAutomation(message, tabId) {
  // Reset state
  isStopped = false;
  activeTabId = tabId;
  currentTasks = message.tasks;
  currentTaskIndex = 0;
  currentLoop = message.loop || 1;
  lastNetworkActivity = Date.now();

  // Initial injection
  await injectHelpers(tabId);
  
  // Start heartbeat monitoring
  startHeartbeat(tabId);
  
  // Begin execution
  executeNextTask(tabId);
}

// Helper verification
async function verifyHelpers(tabId) {
  return chrome.scripting.executeScript({
    target: { tabId },
    func: () => !!window.__automationHelpers?.isInjected,
    world: "MAIN"
  }).then(results => results[0].result);
}

// Heartbeat monitoring
function startHeartbeat(tabId) {
  const interval = setInterval(async () => {
    if (isStopped) {
      clearInterval(interval);
      return;
    }
    
    const helpersExist = await verifyHelpers(tabId);
    if (!helpersExist) {
      await injectHelpers(tabId);
    }
  }, 5000);
}