// 防止重复注册事件监听器的标志
let contextMenuListenersRegistered = false;
let contextMenusCreated = false;

// Service Worker 保活机制
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// 创建右键菜单
function createContextMenus() {
  try {
    if (contextMenusCreated) {
      return;
    }
    
    if (typeof chrome.contextMenus === 'undefined') {
      return;
    }
    
    chrome.contextMenus.removeAll(() => {
      if (chrome.runtime.lastError) {
        // 静默处理
      }
      
      chrome.contextMenus.create({
        id: "dynamicWordAction",
        title: "添加到生词本",
        contexts: ["selection"]
      }, () => {
        if (chrome.runtime.lastError) {
          // 静默处理
        } else {
          contextMenusCreated = true;
        }
      });
    });
  } catch (error) {
    // 静默处理错误
  }
}

// 在扩展安装/更新时创建菜单
chrome.runtime.onInstalled.addListener(() => {
  createContextMenus();
  setupContextMenuListeners();

  // Show onboarding on first install
  chrome.storage.local.get(['onboardingCompleted'], (result) => {
    if (!result.onboardingCompleted) {
      chrome.tabs.create({
        url: chrome.runtime.getURL('onboarding.html')
      });
      chrome.storage.local.set({ onboardingCompleted: true });
    }
  });
});

// 在扩展启动时也创建菜单
chrome.runtime.onStartup.addListener(() => {
  createContextMenus();
  setupContextMenuListeners();
});

// 立即创建菜单
createContextMenus();
setupContextMenuListeners();

// 动态更新右键菜单标题
function updateContextMenuTitle(word, status) {
  try {
    if (typeof chrome.contextMenus === 'undefined') {
      return;
    }
    
    let title = "";
    if (status.isHighlighted) {
      if (status.isMastered) {
        title = `"${word}" 已掌握`;
      } else {
        title = `标记 "${word}" 为已掌握`;
      }
    } else {
      title = `添加 "${word}" 到生词本`;
    }
    
    chrome.contextMenus.update("dynamicWordAction", {
      title: title
    });
    
  } catch (error) {
    // 静默处理错误
  }
}

// 处理右键菜单点击事件
function setupContextMenuListeners() {
  try {
    if (contextMenuListenersRegistered) {
      return;
    }
    
    if (typeof chrome.contextMenus === 'undefined') {
      return;
    }
    
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId === "dynamicWordAction") {
        const selectedText = info.selectionText.trim();
        
        if (selectedText && selectedText.length > 0) {
          chrome.tabs.sendMessage(tab.id, {
            action: "getWordStatus",
            word: selectedText
          }, (response) => {
            if (chrome.runtime.lastError) {
              chrome.tabs.sendMessage(tab.id, {
                action: "addWordToList",
                word: selectedText,
                withSentence: false
              }, () => {
                if (chrome.runtime.lastError) {
                  // 静默处理
                }
              });
              return;
            }
            
            if (response && response.status) {
              const status = response.status;
              
              if (status.isHighlighted) {
                if (status.isMastered) {
                  return;
                } else {
                  chrome.tabs.sendMessage(tab.id, {
                    action: "markWordAsMastered",
                    word: selectedText
                  }, () => {
                    if (chrome.runtime.lastError) {
                      // 静默处理
                    }
                  });
                }
              } else {
                chrome.tabs.sendMessage(tab.id, {
                  action: "addWordToList",
                  word: selectedText,
                  withSentence: false
                }, () => {
                  if (chrome.runtime.lastError) {
                    // 静默处理
                  }
                });
              }
            } else {
              chrome.tabs.sendMessage(tab.id, {
                action: "addWordToList",
                word: selectedText,
                withSentence: false
              }, () => {
                if (chrome.runtime.lastError) {
                  // 静默处理
                }
              });
            }
          });
        }
      }
    });
    
    contextMenuListenersRegistered = true;
    
  } catch (error) {
    // 静默处理错误
  }
}

// ==================== 页面生词计数功能 ====================

let pageWordCount = {};
let pageWordUrl = {};

function updateBadgeCount(tabId) {
  if (pageWordCount[tabId]) {
    const count = pageWordCount[tabId].size;
    
    chrome.action.setBadgeText({
      text: count > 0 ? count.toString() : '',
      tabId: tabId
    });
    
    chrome.action.setBadgeBackgroundColor({
      color: '#f59e0b',
      tabId: tabId
    });
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (pageWordUrl[tabId] !== tab.url) {
    pageWordUrl[tabId] = tab.url;
    if (pageWordCount[tabId]) {
      pageWordCount[tabId].clear();
    } else {
      pageWordCount[tabId] = new Set();
    }
    updateBadgeCount(tabId);
  }
  
  if (changeInfo.status === 'complete') {
    updateBadgeCount(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (pageWordCount[tabId]) {
    pageWordCount[tabId].clear();
    delete pageWordCount[tabId];
    delete pageWordUrl[tabId];
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateContextMenu") {
    updateContextMenuTitle(request.word, request.status);
    sendResponse({ success: true });
  } else if (request.action === "countWord") {
    const tabId = sender.tab.id;
    const word = request.word.toLowerCase();
    
    if (!pageWordCount[tabId]) {
      pageWordCount[tabId] = new Set();
    }
    
    if (!pageWordCount[tabId].has(word)) {
      pageWordCount[tabId].add(word);
      updateBadgeCount(tabId);
    }
    
    sendResponse({ success: true });
  }
  
  return true;
});
