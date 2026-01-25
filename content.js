// 使用立即执行的匿名函数，避免多次注入时重复执行
(function() {
  // 检查是否已经初始化过
  if (window.__wordHighlightExtensionInitialized) {
    return;
  }
  window.__wordHighlightExtensionInitialized = true;
  

// 添加全局错误处理 - 过滤广告和跟踪脚本错误
window.addEventListener('error', function(e) {
  // 广告和跟踪相关域名列表
  const adDomains = [
    'adnxs.com', 'googlesyndication.com', 'doubleclick.net', 'facebook.net',
    'amazon-adsystem.com', 'adrecover.com', 'adsafeprotected.com', 
    'crwdcntrl.net', 'merequartz.com', 'scorecardresearch.com',
    'adlightning.com', 'receptivity.io', 'jsdelivr.net'
  ];
  
  // 检查错误是否来自广告域名
  if (e.filename && adDomains.some(domain => e.filename.includes(domain))) {
    e.preventDefault();
    return false;
  }
  
  // 检查错误消息是否包含广告相关内容
  if (e.message && (
    e.message.includes('ERR_BLOCKED_BY_CLIENT') ||
    e.message.includes('Failed to load resource') ||
    e.message.includes('Minified React error')
  )) {
    e.preventDefault();
    return false;
  }
});

// 添加Promise错误处理
window.addEventListener('unhandledrejection', function(e) {
  // 忽略网络相关的Promise错误
  if (e.reason && (
    e.reason.toString().includes('ERR_BLOCKED_BY_CLIENT') ||
    e.reason.toString().includes('Failed to fetch') ||
    e.reason.toString().includes('NetworkError')
  )) {
    e.preventDefault();
    return false;
  }
});

// 首先检查当前网站是否在白名单中
const currentDomain = window.location.hostname;

chrome.storage.local.get(["words", "masteredWords", "whitelist", "whitelistEnabled"], (data) => {
  try {
    const whitelist = data.whitelist || [];
    const whitelistEnabled = data.whitelistEnabled !== undefined ? data.whitelistEnabled : false;
    
    // 只有当白名单功能启用且当前域名不在白名单中时，才跳过高亮
    if (whitelistEnabled && whitelist.length > 0 && !whitelist.includes(currentDomain)) {
      return;
    }
    
    
    const userWords = Array.isArray(data.words) ? data.words.map(w => (typeof w === 'object' && w.word) ? w.word : w) : [];
    const masteredWords = data.masteredWords || [];
    

    // 使用 document_idle 运行时机，页面已经完全准备好，可以直接开始高亮
    
    fetch(chrome.runtime.getURL("words.json"))
      .then(response => response.json())
      .then(jsonData => {
        const defaultWords = Array.isArray(jsonData.words) ? jsonData.words.map(w => (typeof w === 'object' && w.word) ? w.word : w) : [];
        
        // 合并用户单词和默认单词，去重
        const allUnmasteredWords = Array.from(new Set([...userWords, ...defaultWords]))
          .filter(word => !masteredWords.includes(word));
        
        // 保存到全局变量，供 MutationObserver 使用
        globalUnmasteredWords = allUnmasteredWords;
        globalMasteredWords = masteredWords;
        
        // 一次性高亮所有未掌握的单词（避免重复高亮）
        if (allUnmasteredWords.length > 0) {
          highlightWords(allUnmasteredWords, false);
        }
        
        // 高亮已掌握的单词（低调高亮）
        if (masteredWords.length > 0) {
          highlightWords(masteredWords, true);
        }
        
        // 启动 MutationObserver 监听动态内容
        setupMutationObserver();
      })
      .catch(() => {});
    
  } catch (error) { // 静默处理
    // 静默处理
  }
});

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 全局变量用于累积页面统计数据（避免多次调用highlightWords时重置）
let globalPageStats = {};
let globalPageLastSentence = {};
let pendingSavePromise = null; // 用于跟踪待处理的保存操作

// 全局变量存储单词列表，供 MutationObserver 使用
let globalUnmasteredWords = [];
let globalMasteredWords = [];

// 初始化页面统计变量

// MutationObserver 用于处理动态加载的内容
let mutationObserver = null;

function setupMutationObserver() {
  if (mutationObserver) {
    return; // 已经设置过了
  }
  
  mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          // 跳过非元素节点
          if (!node || node.nodeType !== Node.ELEMENT_NODE) {
            return;
          }
          
          // 跳过已高亮的元素
          if (node.classList && (
            node.classList.contains('enladder-highlight') ||
            node.classList.contains('enladder-highlight-mastered')
          )) {
            return;
          }
          
          // 跳过脚本、样式等元素
          if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK', 'IFRAME'].includes(node.tagName)) {
            return;
          }
          
          // 对新添加的节点进行高亮
          if (globalUnmasteredWords.length > 0 || globalMasteredWords.length > 0) {
            // 使用 requestIdleCallback 避免阻塞
            if (window.requestIdleCallback) {
              requestIdleCallback(() => {
                highlightNewNode(node);
              }, { timeout: 1000 });
            } else {
              setTimeout(() => {
                highlightNewNode(node);
              }, 100);
            }
          }
        });
      }
    });
  });
  
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
  
}

// 高亮新添加的节点
function highlightNewNode(node) {
  try {
    // 高亮未掌握的单词
    if (globalUnmasteredWords.length > 0) {
      highlightWordsInNode(node, globalUnmasteredWords, false);
    }
    
    // 高亮已掌握的单词
    if (globalMasteredWords.length > 0) {
      highlightWordsInNode(node, globalMasteredWords, true);
    }
  } catch (error) { // 静默处理
  }
}

// 在指定节点内高亮单词（用于 MutationObserver）
function highlightWordsInNode(rootNode, words, isMastered) {
  if (!rootNode || words.length === 0) return;
  
  try {
    // 确保 rootNode 是元素节点，如果是文本节点则使用其父节点
    let targetNode = rootNode;
    if (rootNode.nodeType === Node.TEXT_NODE) {
      targetNode = rootNode.parentNode;
      if (!targetNode) return;
    }
    
    // 确保节点仍在 DOM 中
    if (!document.contains(targetNode)) return;
    
    // 跳过已高亮的元素和不应处理的元素
    if (targetNode.classList && (
      targetNode.classList.contains('enladder-highlight') ||
      targetNode.classList.contains('enladder-highlight-mastered')
    )) {
      return;
    }
    
    if (targetNode.tagName && ['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'NOSCRIPT', 'IFRAME'].includes(targetNode.tagName)) {
      return;
    }
    
    // 构建正则表达式
    const escapedWords = words.map(word => escapeRegExp(word));
    const wordRegex = new RegExp(`\\b(${escapedWords.join('|')})\\b`, 'gi');
    
    // 收集所有文本节点
    const textNodes = [];
    
    // 简单递归收集文本节点，比 TreeWalker 更稳定
    function collectTextNodes(node) {
      if (!node) return;
      
      if (node.nodeType === Node.TEXT_NODE) {
        // 跳过已高亮元素内的文本
        if (node.parentNode && (
          node.parentNode.classList?.contains('enladder-highlight') ||
          node.parentNode.classList?.contains('enladder-highlight-mastered') ||
          node.parentNode.tagName === 'RUBY'
        )) {
          return;
        }
        // 跳过脚本、样式等
        if (node.parentNode && ['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'NOSCRIPT'].includes(node.parentNode.tagName)) {
          return;
        }
        if (node.nodeValue && node.nodeValue.trim()) {
          textNodes.push(node);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // 跳过已高亮的元素
        if (node.classList && (
          node.classList.contains('enladder-highlight') ||
          node.classList.contains('enladder-highlight-mastered')
        )) {
          return;
        }
        // 跳过不应处理的元素
        if (['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'NOSCRIPT', 'IFRAME'].includes(node.tagName)) {
          return;
        }
        // 递归处理子节点
        const children = [...node.childNodes];
        children.forEach(child => collectTextNodes(child));
      }
    }
    
    collectTextNodes(targetNode);
    
    // 处理每个文本节点
    textNodes.forEach(node => {
      try {
        if (!node.nodeValue || !node.parentNode || !document.contains(node)) return;
        
        const text = node.nodeValue;
        const matches = [...text.matchAll(wordRegex)];
        if (matches.length === 0) return;
        
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        
        matches.forEach(match => {
          const word = match[0];
          const offset = match.index;
          
          // 添加前面的文本
          if (offset > lastIndex) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex, offset)));
          }
          
          // 创建高亮元素
          const ruby = document.createElement("ruby");
          ruby.className = isMastered ? "enladder-highlight-mastered" : "enladder-highlight";
          ruby.setAttribute("data-word", word.toLowerCase());
          ruby.appendChild(document.createTextNode(word));
          
          const rt = document.createElement("rt");
          rt.className = "enladder-translation";
          rt.textContent = "";
          ruby.appendChild(rt);
          
          // 简单的例句（直接使用文本节点内容）
          const sentence = text.trim().length > 200 ? text.trim().substring(0, 200) + '...' : text.trim();
          
          ruby.addEventListener("click", (e) => {
            e.stopPropagation();
            showEnladderStyleCard(word, sentence, isMastered);
          });
          
          ruby.setAttribute("title", `点击查看 "${word}" 的详细信息`);
          fragment.appendChild(ruby);
          
          lastIndex = offset + word.length;
        });
        
        // 添加剩余文本
        if (lastIndex < text.length) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }
        
        // 替换原节点（确保节点仍在 DOM 中）
        if (node.parentNode && document.contains(node)) {
          node.parentNode.replaceChild(fragment, node);
        }
      } catch (nodeError) {
        // 单个节点处理失败不影响其他节点
      }
    });
  } catch (error) { // 静默处理
    // 降级为 debug 级别，避免控制台刷屏
  }
}

function highlightWords(words, isMastered = false) {
  
  if (words.length === 0) {
    return;
  }
  
  // 检查页面是否被广告脚本破坏
  if (!document.body || !document.documentElement) {
    return;
  }
  
  try {
    // 提高单词处理数量限制，支持更多单词高亮
    const maxWords = 500;
    const wordsToProcess = words.slice(0, maxWords);
    
    if (words.length > maxWords) {
    }
    
    // 按长度降序排列，优先匹配长短语
    wordsToProcess.sort((a, b) => b.length - a.length);

    // 构造正则：短语直接匹配，单词加边界
    const pattern = wordsToProcess.map(w => {
      if (w.includes(' ')) {
        return escapeRegExp(w);
      } else {
        return `\\b${escapeRegExp(w)}\\b`;
      }
    }).join('|');

    const wordRegex = new RegExp(`(${pattern})`, "gi");
    
    // 用于临时存储本次高亮的统计结果
    let highlightCount = 0;
    let errorCount = 0;
    
    // 提取包含单词的整句话
    function extractSentence(text, word, matchIndex) {
      try {
        const separators = /[.!?。！？\n]/g;
        let start = 0, end = text.length;
        
        // 向前找最近的分隔符，但不要超过200个字符
        const maxLookback = Math.min(200, matchIndex);
        for (let i = matchIndex - 1; i >= Math.max(0, matchIndex - maxLookback); i--) {
          if (separators.test(text[i])) { 
            start = i + 1; 
            separators.lastIndex = 0;
            break; 
          }
        }
        
        // 向后找最近的分隔符，但不要超过300个字符
        const maxLookforward = Math.min(300, text.length - matchIndex);
        for (let i = matchIndex; i < Math.min(text.length, matchIndex + maxLookforward); i++) {
          if (separators.test(text[i])) { 
            end = i + 1; 
            separators.lastIndex = 0;
            break; 
          }
        }
        
        let sentence = text.slice(start, end).trim();
        
        // 如果句子太长，截取合适长度
        if (sentence.length > 150) {
          const wordPos = sentence.indexOf(word);
          if (wordPos > 0) {
            const beforeWord = sentence.substring(0, wordPos);
            const afterWord = sentence.substring(wordPos + word.length);
            
            // 在单词前后各取75个字符
            const startPos = Math.max(0, beforeWord.length - 75);
            const endPos = Math.min(sentence.length, wordPos + word.length + 75);
            sentence = sentence.substring(startPos, endPos);
            
            // 添加省略号表示被截断
            if (startPos > 0) sentence = '...' + sentence;
            if (endPos < text.slice(start, end).trim().length) sentence = sentence + '...';
          }
        }
        
        return sentence;
      } catch (error) { // 静默处理
        return '提取句子失败';
      }
    }

    function updateWordStats(word, sentence) {
      try {
        const normalizedWord = word.toLowerCase();
        globalPageStats[normalizedWord] = (globalPageStats[normalizedWord] || 0) + 1;
        globalPageLastSentence[normalizedWord] = sentence;
      } catch (error) { // 静默处理
      }
    }

    function saveStats() {
      try {
        
        if (Object.keys(globalPageStats).length === 0) {
          return Promise.resolve();
        }
        
        // 等待之前的保存操作完成，避免并发问题
        if (pendingSavePromise) {
          return pendingSavePromise.then(() => saveStats());
        }
        
        // 创建当前数据的副本，避免在异步操作期间数据被修改
        const statsToSave = { ...globalPageStats };
        const sentencesToSave = { ...globalPageLastSentence };
        
        // 立即清空全局变量，允许继续收集新的统计数据
        globalPageStats = {};
        globalPageLastSentence = {};
        
        // 使用 Promise 来确保异步操作正确执行
        pendingSavePromise = chrome.storage.local.get(['wordStats', 'wordLastSentence']).then((result) => {
          let currentStats = result.wordStats || {};
          let lastSentence = result.wordLastSentence || {};
          
          
          // 合并本次页面高亮的单词
          Object.entries(statsToSave).forEach(([word, count]) => {
            const oldCount = currentStats[word] || 0;
            currentStats[word] = oldCount + count;
          });
          
          // 合并本次页面的最近句子
          Object.entries(sentencesToSave).forEach(([word, sentence]) => {
            lastSentence[word] = sentence;
          });
          
          
          // 保存统计数据
          return chrome.storage.local.set({ 
            wordStats: currentStats, 
            wordLastSentence: lastSentence 
          });
        }).then(() => {
          pendingSavePromise = null;
        }).catch((error) => {
          pendingSavePromise = null;
        });
        
        return pendingSavePromise;
        
      } catch (error) { // 静默处理
        pendingSavePromise = null;
        return Promise.reject(error);
      }
    }

    function replaceTextNode(node) {
      try {
        // 安全检查：确保节点和父节点存在
        if (!node || !node.nodeValue || !node.parentNode) {
          return;
        }
        
        const text = node.nodeValue;
        let matches = [...text.matchAll(wordRegex)];
        if (matches.length === 0) return;
        
        highlightCount += matches.length;
        
        let lastIndex = 0;
        const parent = node.parentNode;
        
        // 检查父节点是否还在DOM中
        if (!parent || !document.contains(parent)) {
          return;
        }
        
        const fragment = document.createDocumentFragment();
        
        matches.forEach(match => {
          try {
            const word = match[0];
            const offset = match.index;
            
            // 添加前面的文本
            if (offset > lastIndex) {
              fragment.appendChild(document.createTextNode(text.slice(lastIndex, offset)));
            }
            
            // 使用 Ruby 标签创建 Enladder 风格的高亮显示
            const ruby = document.createElement("ruby");
            ruby.className = isMastered ? "enladder-highlight-mastered" : "enladder-highlight";
            ruby.setAttribute("data-word", word.toLowerCase());
            
            // 创建单词文本节点
            const wordText = document.createTextNode(word);
            ruby.appendChild(wordText);
            
            // 添加释义作为 rt 标签（类似Enladder的上标显示）
            const rt = document.createElement("rt");
            rt.className = "enladder-translation";
            // 暂时显示为空，实际会在悬停时显示
            rt.textContent = "";
            ruby.appendChild(rt);
            
            // 提取例句（用于点击事件和统计）
            const sentence = extractSentence(text, word, offset);
            
            // 添加点击事件，显示详细卡片（完全模仿Enladder）
            ruby.addEventListener("click", (e) => {
              e.stopPropagation();
              showEnladderStyleCard(word, sentence, isMastered);
            });
            
            // 悬停时显示简短提示
            ruby.setAttribute("title", `点击查看 "${word}" 的详细信息`);
            
            fragment.appendChild(ruby);
            
            
            // 只对未掌握的单词进行统计
            if (!isMastered) {
              updateWordStats(word, sentence);
            }
            
            lastIndex = offset + word.length;
          } catch (error) { // 静默处理
            errorCount++;
          }
        });
        
        // 添加剩余的文本
        if (lastIndex < text.length) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }
        
        parent.replaceChild(fragment, node);
      } catch (error) { // 静默处理
        errorCount++;
      }
    }

    function traverseNodes(node) {
      try {
        // 安全检查：确保节点存在且有效
        if (!node || !node.nodeType || !document.contains(node)) {
          return;
        }
        
        if (node.nodeType === Node.TEXT_NODE) {
          replaceTextNode(node);
        } else if (node.nodeType === Node.ELEMENT_NODE && 
                   !["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "NOSCRIPT", "META", "LINK", "IFRAME"].includes(node.tagName) &&
                   !node.classList?.contains('highlighted-word') &&
                   !node.classList?.contains('highlighted-word-mastered')) {
          
          // 创建子节点副本以避免在遍历时修改DOM
          const childNodes = [...node.childNodes];
          for (let child of childNodes) {
            try {
              // 检查子节点是否还存在
              if (child && child.parentNode === node) {
                traverseNodes(child);
              }
            } catch (error) { // 静默处理
              errorCount++;
            }
          }
        }
      } catch (error) { // 静默处理
        errorCount++;
      }
    }

    // 执行遍历和高亮 - 添加延迟确保页面稳定
    
    // 使用 document_idle 运行，页面已经准备好，直接执行高亮
    const executeHighlight = () => {
      try {
        if (document.body) {
          traverseNodes(document.body);
          
          // 只对未掌握的单词保存统计数据
          if (!isMastered && Object.keys(globalPageStats).length > 0) {
            saveStats().catch(() => {});
          }
        }
      } catch (error) { // 静默处理
        // 静默处理错误
      }
    };
    
    // 使用 requestIdleCallback 在浏览器空闲时执行，避免阻塞交互
    if (window.requestIdleCallback) {
      requestIdleCallback(executeHighlight, { timeout: 500 });
    } else {
      setTimeout(executeHighlight, 10);
    }
    
  } catch (error) { // 静默处理
  }
}

// 监听来自background script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "addWordToList") {
    addWordFromContextMenu(request.word, request.withSentence);
    sendResponse({ success: true });
  } else if (request.action === "markWordAsMastered") {
    markWordAsMasteredFromContextMenu(request.word);
    sendResponse({ success: true });
  } else if (request.action === "refreshHighlight") {
    refreshHighlight();
    sendResponse({ success: true });
  } else if (request.action === "getWordStatus") {
    const status = getWordStatus(request.word);
    sendResponse({ status: status });
  }
  
  return true;
});

// 刷新高亮功能
function refreshHighlight() {
  
  // 重置全局统计变量
  globalPageStats = {};
  globalPageLastSentence = {};
  pendingSavePromise = null;
  
  // 清除现有的高亮（包括Ruby标签）
  const existingHighlights = document.querySelectorAll('ruby.enladder-highlight, ruby.enladder-highlight-mastered');
  
  existingHighlights.forEach(highlight => {
    const parent = highlight.parentNode;
    if (parent) {
      // Ruby标签的文本内容在第一个文本节点中
      const textContent = highlight.firstChild ? highlight.firstChild.textContent : highlight.textContent;
      parent.replaceChild(document.createTextNode(textContent), highlight);
      parent.normalize();
    }
  });
  
  // 重新加载单词列表并高亮
  chrome.storage.local.get(["words", "masteredWords", "whitelist", "whitelistEnabled"], (data) => {
    const whitelist = data.whitelist || [];
    const whitelistEnabled = data.whitelistEnabled !== undefined ? data.whitelistEnabled : false;
    const currentDomain = window.location.hostname;
    
    // 只有当白名单功能启用且当前域名不在白名单中时，才跳过高亮
    if (whitelistEnabled && whitelist.length > 0 && !whitelist.includes(currentDomain)) {
      return;
    }
    
    const userWords = Array.isArray(data.words) ? data.words.map(w => (typeof w === 'object' && w.word) ? w.word : w) : [];
    const masteredWords = data.masteredWords || [];
    
    
    fetch(chrome.runtime.getURL("words.json"))
      .then(response => response.json())
      .then(jsonData => {
        const defaultWords = Array.isArray(jsonData.words) ? jsonData.words.map(w => (typeof w === 'object' && w.word) ? w.word : w) : [];
        
        // 合并用户单词和默认单词，去重，避免重复高亮
        const allUnmasteredWords = Array.from(new Set([...userWords, ...defaultWords]))
          .filter(word => !masteredWords.includes(word));
        
        // 一次性高亮所有未掌握的单词
        if (allUnmasteredWords.length > 0) {
          highlightWords(allUnmasteredWords, false);
        }
        
        if (masteredWords.length > 0) {
          highlightWords(masteredWords, true);
        }
        
      })
  });
}

// 从右键菜单添加单词到生词本
async function addWordFromContextMenu(word, withSentence) {
  try {
    
    const result = await chrome.storage.local.get(['words']);
    let currentWords = result.words || [];
    
    
    // 检查单词是否已存在（不区分大小写）
    const wordExists = currentWords.some(w => {
      const storedWord = typeof w === 'object' && w.word ? w.word : w;
      return storedWord.toLowerCase() === word.toLowerCase();
    });
    
    if (wordExists) {
      showNotification(`单词 "${word}" 已存在于生词本中`, 'warning');
      return;
    }
    
    // 添加新单词（统一存储为字符串格式）
    currentWords.push(word);
    
    
    // 保存到存储
    await chrome.storage.local.set({ words: currentWords });
    
    
    // 显示成功消息
    showNotification(`单词 "${word}" 已添加到生词本`, 'success');
    
    // 立即高亮新添加的单词
    highlightWords([word], false);
    
    
  } catch (error) { // 静默处理
    showNotification('添加单词失败，请重试', 'error');
  }
}

// 从右键菜单标记单词为已掌握
async function markWordAsMasteredFromContextMenu(word) {
  try {
    const result = await chrome.storage.local.get(['words', 'masteredWords', 'masteredWordsTimestamp', 'wordStats', 'wordLastSentence']);
    
    let words = result.words || [];
    let masteredWords = result.masteredWords || [];
    let masteredWordsTimestamp = result.masteredWordsTimestamp || {};
    let wordStats = result.wordStats || {};
    let wordLastSentence = result.wordLastSentence || {};
    
    // 检查单词是否在生词本中
    let wordIndex = -1;
    
    // 检查Chrome存储中的生词本
    wordIndex = words.findIndex(w => {
      const storedWord = typeof w === 'object' && w.word ? w.word : w;
      return storedWord.toLowerCase() === word.toLowerCase();
    });
    
    if (wordIndex !== -1) {
      // 从Chrome存储的生词本中移除
      words.splice(wordIndex, 1);
      
      // 添加到已掌握列表
      if (!masteredWords.includes(word)) {
        masteredWords.push(word);
        masteredWordsTimestamp[word] = Date.now();
      }
      
      // 删除相关统计数据
      delete wordStats[word.toLowerCase()];
      delete wordLastSentence[word.toLowerCase()];
      
      // 保存所有更改
      await chrome.storage.local.set({
        words,
        masteredWords,
        masteredWordsTimestamp,
        wordStats,
        wordLastSentence
      });
      
      // 显示成功消息
      showNotification(`单词 "${word}" 已标记为已掌握`, 'success');
      
      // 立即更新页面高亮
      updateWordHighlightStyle(word, true);
      
    } else {
      showNotification(`单词 "${word}" 不在生词本中，无法标记为已掌握`, 'warning');
    }
    
  } catch (error) { // 静默处理
    showNotification('标记失败，请重试', 'error');
  }
}

// 更新单词的高亮样式
function updateWordHighlightStyle(word, isMastered) {
  try {
    const highlightedElements = document.querySelectorAll('ruby.enladder-highlight, ruby.enladder-highlight-mastered');
    
    highlightedElements.forEach((element) => {
      // Ruby标签的文本在第一个文本节点
      const elementText = element.firstChild ? element.firstChild.textContent : element.textContent;
      if (elementText.toLowerCase() === word.toLowerCase()) {
        // 移除旧的类名
        element.classList.remove('enladder-highlight', 'enladder-highlight-mastered');
        
        // 添加新的类名
        if (isMastered) {
          element.classList.add('enladder-highlight-mastered');
        } else {
          element.classList.add('enladder-highlight');
        }
      }
    });
    
  } catch (error) { // 静默处理
  }
}

// 检查单词的当前状态
function getWordStatus(word) {
  const highlightedElements = document.querySelectorAll('ruby.enladder-highlight, ruby.enladder-highlight-mastered');
  
  let isHighlighted = false;
  let isMastered = false;
  
  highlightedElements.forEach((element) => {
    const elementText = element.firstChild ? element.firstChild.textContent.trim() : element.textContent.trim();
    const isMatch = elementText.toLowerCase() === word.toLowerCase();
    
    if (isMatch) {
      isHighlighted = true;
      isMastered = element.classList.contains('enladder-highlight-mastered');
    }
  });
  
  return { isHighlighted, isMastered };
}

// 显示通知消息
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    z-index: 10000;
    max-width: 300px;
    word-wrap: break-word;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    transform: translateX(100%);
    transition: transform 0.2s ease;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  
  // 根据类型设置样式
  switch (type) {
    case 'success':
      notification.style.background = '#10b981';
      break;
    case 'warning':
      notification.style.background = '#f59e0b';
      break;
    case 'error':
      notification.style.background = '#ef4444';
      break;
    default:
      notification.style.background = '#3b82f6';
  }
  
  notification.textContent = message;
  document.body.appendChild(notification);
  
  // 显示动画
  setTimeout(() => {
    notification.style.transform = 'translateX(0)';
  }, 100);
  
  // 自动隐藏
  setTimeout(() => {
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

// ==================== Enladder 风格单词卡片弹窗 ====================

// 内置的常用单词翻译数据库（扩展版）
const builtinTranslations = {
  // 高频词汇
  'the': '这个；那个', 'a': '一个', 'an': '一个', 'and': '和；与', 'or': '或者',
  'but': '但是', 'if': '如果', 'when': '当...时', 'where': '在哪里', 'why': '为什么',
  'how': '如何', 'what': '什么', 'who': '谁', 'which': '哪个',
  
  // 常用动词
  'is': '是', 'are': '是', 'was': '是', 'were': '是', 'be': '是；成为',
  'have': '有', 'has': '有', 'had': '有', 'do': '做', 'does': '做', 'did': '做',
  'will': '将要', 'would': '将会', 'can': '能够', 'could': '能', 'should': '应该',
  'may': '可能', 'might': '可能', 'must': '必须', 'shall': '将要',
  'get': '获得', 'make': '制作', 'go': '去', 'take': '拿', 'come': '来',
  'see': '看见', 'know': '知道', 'think': '思考', 'look': '看', 'want': '想要',
  'give': '给', 'use': '使用', 'find': '找到', 'tell': '告诉', 'ask': '询问',
  'work': '工作', 'seem': '似乎', 'feel': '感觉', 'try': '尝试', 'leave': '离开',
  'call': '打电话', 'need': '需要', 'become': '成为', 'help': '帮助', 'say': '说',
  
  // 形容词
  'good': '好的', 'bad': '坏的', 'big': '大的', 'small': '小的', 'great': '伟大的',
  'new': '新的', 'old': '旧的', 'young': '年轻的', 'long': '长的', 'short': '短的',
  'high': '高的', 'low': '低的', 'quick': '快的', 'fast': '快的', 'slow': '慢的',
  'early': '早的', 'late': '晚的', 'important': '重要的', 'easy': '容易的',
  'hard': '困难的', 'difficult': '困难的', 'simple': '简单的', 'different': '不同的',
  'same': '相同的', 'right': '对的', 'wrong': '错的', 'true': '真的', 'false': '假的',
  'free': '免费的', 'busy': '忙的', 'happy': '快乐的', 'sad': '悲伤的',
  
  // 名词
  'time': '时间', 'year': '年', 'day': '天', 'week': '周', 'month': '月',
  'people': '人们', 'person': '人', 'man': '男人', 'woman': '女人', 'child': '孩子',
  'friend': '朋友', 'family': '家庭', 'life': '生活', 'world': '世界', 'country': '国家',
  'home': '家', 'house': '房子', 'room': '房间', 'food': '食物', 'water': '水',
  'book': '书', 'school': '学校', 'money': '金钱', 'hand': '手', 'eye': '眼睛',
  'dog': '狗', 'cat': '猫', 'example': '例子', 'word': '单词', 'test': '测试',
  
  // 副词
  'very': '非常', 'too': '也；太', 'also': '也', 'well': '好地', 'just': '仅仅',
  'now': '现在', 'then': '那时', 'here': '这里', 'there': '那里', 'always': '总是',
  'never': '从不', 'sometimes': '有时', 'often': '经常', 'usually': '通常',
  'really': '真正地', 'almost': '几乎', 'quite': '相当', 'still': '仍然',
  
  // words.json 中的单词
  'vulnerable': '脆弱的', 'abbreviated': '缩写的', 'abbreviation': '缩写',
  'abdication': '退位', 'abhorrence': '憎恨', 'abject': '悲惨的', 'ablaze': '着火的',
  'abruptly': '突然地', 'absorbing': '吸引人的', 'abstain': '戒除', 'abstinence': '节制',
  'abysmal': '极坏的', 'acclimate': '适应', 'accommodate': '容纳', 'accomplished': '有造诣的',
  'accountability': '责任', 'accredited': '认可的', 'acumen': '精明', 'acute': '严重的',
  'brown': '棕色的', 'fox': '狐狸', 'jump': '跳跃', 'lazy': '懒惰的', 'over': '在...上面'
};

// 全局翻译缓存（从API获取或本地缓存）
let translationCache = {};

// 获取单词翻译
async function getTranslation(word) {
  const lowerWord = word.toLowerCase();
  
  // 1. 优先使用内置翻译
  if (builtinTranslations[lowerWord]) {
    return builtinTranslations[lowerWord];
  }
  
  // 2. 检查缓存
  if (translationCache[lowerWord]) {
    return translationCache[lowerWord];
  }
  
  // 3. 从Chrome存储中读取缓存的翻译
  try {
    const result = await chrome.storage.local.get(['translationCache']);
    const storedCache = result.translationCache || {};
    if (storedCache[lowerWord]) {
      translationCache[lowerWord] = storedCache[lowerWord];
      return storedCache[lowerWord];
    }
  } catch (error) { // 静默处理
  }
  
  // 4. 返回默认值
  return '点击发音按钮查看释义';
}

async function showEnladderStyleCard(word, sentence, isMastered) {
  // 移除已存在的卡片
  const existingCard = document.querySelector('.enladder-word-popup-container');
  if (existingCard) {
    existingCard.remove();
  }
  
  // 异步获取翻译
  const translation = await getTranslation(word);
  
  // 创建Shadow DOM容器（完全隔离样式，模仿Enladder）
  const container = document.createElement('div');
  container.className = 'enladder-word-popup-container';
  container.setAttribute('data-enladder-popup', 'true');
  
  // 创建Shadow DOM
  const shadow = container.attachShadow({ mode: 'open' });
  
  // 添加样式（完全模仿Enladder）
  const style = document.createElement('style');
  style.textContent = `
    .enladder-popup-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100vh;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 999999;
      opacity: 0;
      transition: opacity 0.3s ease;
      backdrop-filter: blur(4px);
    }
    
    .enladder-popup-overlay.active {
      opacity: 1;
    }
    
    .enladder-popup {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      padding: 20px;
      width: 380px;
      max-height: 440px;
      position: relative;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: translateY(20px) scale(0.95);
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    
    .enladder-popup.active {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
    
    .enladder-popup-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }
    
    .enladder-popup-word {
      font-size: 24px;
      font-weight: bold;
      margin: 0;
      color: #333;
    }
    
    .enladder-popup-close {
      cursor: pointer;
      font-size: 24px;
      color: #999;
      background: none;
      border: none;
      padding: 5px;
      line-height: 1;
      transition: color 0.2s;
    }
    
    .enladder-popup-close:hover {
      color: #666;
    }
    
    .enladder-popup-section {
      margin: 10px 0;
      font-size: 14px;
    }
    
    .enladder-popup-section-title {
      color: #666;
      font-size: 14px;
      margin-bottom: 5px;
    }
    
    .enladder-popup-translation {
      background: #f9fafb;
      padding: 12px;
      border-radius: 6px;
      font-size: 15px;
      line-height: 1.6;
      color: #374151;
      margin-bottom: 15px;
    }
    
    .enladder-popup-sentence {
      background: #f0f0f0;
      padding: 12px;
      border-radius: 6px;
      font-size: 14px;
      line-height: 1.6;
      color: #666;
    }
    
    .enladder-popup-audio {
      cursor: pointer;
      background: none;
      border: none;
      font-size: 20px;
      padding: 5px 8px;
      margin-left: 5px;
      transition: transform 0.2s;
      vertical-align: middle;
    }
    
    .enladder-popup-audio:hover {
      transform: scale(1.1);
    }
    
    .enladder-popup-audio:active {
      transform: scale(0.95);
    }
    
    .enladder-popup-actions {
      display: flex;
      gap: 10px;
      margin-top: 15px;
      padding-top: 15px;
      border-top: 1px solid #eee;
    }
    
    .enladder-popup-button {
      flex: 1;
      padding: 10px 20px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.2s;
    }
    
    .enladder-popup-button.primary {
      background-color: #4CAF50;
      color: white;
    }
    
    .enladder-popup-button.primary:hover {
      background-color: #45a049;
    }
    
    .enladder-popup-button.secondary {
      background-color: #f0f0f0;
      color: #333;
    }
    
    .enladder-popup-button.secondary:hover {
      background-color: #e0e0e0;
    }
  `;
  shadow.appendChild(style);
  
  // 创建弹窗HTML
  const popupHTML = document.createElement('div');
  popupHTML.className = 'enladder-popup-overlay';
  
  // 获取统计信息
  let statsHTML = '';
  try {
    const result = await chrome.storage.local.get(['wordStats']);
    const stats = result.wordStats || {};
    const count = stats[word.toLowerCase()] || 0;
    
    if (count > 0) {
      statsHTML = `
        <div class="enladder-popup-section">
          <div class="enladder-popup-section-title">统计</div>
          <div style="color: #666;">已遇到 <strong style="color: #4CAF50; font-size: 16px;">${count}</strong> 次</div>
        </div>
      `;
    }
  } catch (error) { // 静默处理
  }
  
  popupHTML.innerHTML = `
    <div class="enladder-popup">
      <div class="enladder-popup-header">
        <div>
          <span class="enladder-popup-word">${word}</span>
          <span class="enladder-popup-audio" title="点击发音">🔊</span>
        </div>
        <span class="enladder-popup-close">×</span>
      </div>
      <div class="enladder-popup-section">
        <div class="enladder-popup-section-title">中文释义</div>
        <div class="enladder-popup-translation">${translation}</div>
      </div>
      ${sentence ? `
      <div class="enladder-popup-section">
        <div class="enladder-popup-section-title">例句</div>
        <div class="enladder-popup-sentence">${sentence}</div>
      </div>
      ` : ''}
      ${statsHTML}
      <div class="enladder-popup-actions">
        ${!isMastered ?
          `<button class="enladder-popup-button primary" data-action="master">标记为已掌握</button>` :
          `<button class="enladder-popup-button secondary" data-action="unmaster">移回生词本</button>`
        }
      </div>
    </div>
  `;
  
  shadow.appendChild(popupHTML);
  document.body.appendChild(container);
  
  // 添加动画
  setTimeout(() => {
    popupHTML.classList.add('active');
    const popup = popupHTML.querySelector('.enladder-popup');
    if (popup) popup.classList.add('active');
  }, 10);
  
  // 绑定事件
  const closeBtn = popupHTML.querySelector('.enladder-popup-close');
  closeBtn.addEventListener('click', () => {
    popupHTML.classList.remove('active');
    const popup = popupHTML.querySelector('.enladder-popup');
    if (popup) popup.classList.remove('active');
    setTimeout(() => container.remove(), 300);
  });
  
  popupHTML.addEventListener('click', (e) => {
    if (e.target === popupHTML) {
      popupHTML.classList.remove('active');
      const popup = popupHTML.querySelector('.enladder-popup');
      if (popup) popup.classList.remove('active');
      setTimeout(() => container.remove(), 300);
    }
  });
  
  // 发音按钮
  const audioBtn = popupHTML.querySelector('.enladder-popup-audio');
  audioBtn.addEventListener('click', () => speakWord(word));
  
  // 操作按钮
  const actionBtns = popupHTML.querySelectorAll('[data-action]');
  actionBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.getAttribute('data-action');
      if (action === 'master') {
        await markWordAsMasteredFromCard(word);
      } else if (action === 'unmaster') {
        await unmasterWord(word);
      }
      popupHTML.classList.remove('active');
      setTimeout(() => container.remove(), 300);
    });
  });
}

// 单词发音功能
function speakWord(word) {
  if (window.speechSynthesis) {
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }
}

// 从卡片标记单词为已掌握
async function markWordAsMasteredFromCard(word) {
  try {
    const result = await chrome.storage.local.get(['words', 'masteredWords', 'masteredWordsTimestamp', 'wordStats', 'wordLastSentence']);
    
    let words = result.words || [];
    let masteredWords = result.masteredWords || [];
    let masteredWordsTimestamp = result.masteredWordsTimestamp || {};
    let wordStats = result.wordStats || {};
    let wordLastSentence = result.wordLastSentence || {};
    
    // 从生词本中移除
    const wordIndex = words.findIndex(w => {
      const storedWord = typeof w === 'object' && w.word ? w.word : w;
      return storedWord.toLowerCase() === word.toLowerCase();
    });
    
    if (wordIndex !== -1) {
      words.splice(wordIndex, 1);
    }
    
    // 添加到已掌握列表
    if (!masteredWords.includes(word)) {
      masteredWords.push(word);
      masteredWordsTimestamp[word] = Date.now();
    }
    
    // 删除统计数据
    delete wordStats[word.toLowerCase()];
    delete wordLastSentence[word.toLowerCase()];
    
    // 保存
    await chrome.storage.local.set({
      words,
      masteredWords,
      masteredWordsTimestamp,
      wordStats,
      wordLastSentence
    });
    
    showNotification(`"${word}" 已标记为已掌握`, 'success');
    
    // 更新页面高亮
    updateWordHighlightStyle(word, true);
    
  } catch (error) { // 静默处理
    showNotification('操作失败，请重试', 'error');
  }
}

async function unmasterWord(word) {
  try {
    const result = await chrome.storage.local.get(['words', 'masteredWords', 'masteredWordsTimestamp']);
    
    let words = result.words || [];
    let masteredWords = result.masteredWords || [];
    let masteredWordsTimestamp = result.masteredWordsTimestamp || {};
    
    // 从已掌握列表移除
    masteredWords = masteredWords.filter(w => w !== word);
    delete masteredWordsTimestamp[word];
    
    // 添加回生词本
    if (!words.includes(word)) {
      words.push(word);
    }
    
    // 保存
    await chrome.storage.local.set({
      words,
      masteredWords,
      masteredWordsTimestamp
    });
    
    showNotification(`"${word}" 已移回生词本`, 'success');
    
    // 更新页面高亮
    updateWordHighlightStyle(word, false);
    
  } catch (error) { // 静默处理
    showNotification('操作失败，请重试', 'error');
  }
}

})(); // 结束立即执行的匿名函数
