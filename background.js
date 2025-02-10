console.log('DeepSeek Translator: Background script loaded');

// 检查URL是否可以注入脚本
function isValidUrl(url) {
  if (!url) return false;
  return !url.startsWith('chrome://') && 
         !url.startsWith('chrome-extension://') && 
         !url.startsWith('chrome-search://') &&
         !url.startsWith('chrome-devtools://') &&
         !url.startsWith('about:') &&
         !url.startsWith('edge://') &&
         !url.startsWith('brave://') &&
         !url.startsWith('opera://') &&
         !url.startsWith('vivaldi://') &&
         !url.startsWith('file://');
}

// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  console.log('DeepSeek Translator: Extension installed/updated');
  
  // 移除现有菜单（如果存在）
  chrome.contextMenus.removeAll(() => {
    // 创建新菜单
    chrome.contextMenus.create({
      id: "translate-selection",
      title: "翻译选中文本",
      contexts: ["selection"]
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('DeepSeek Translator: Error creating context menu:', chrome.runtime.lastError);
      } else {
        console.log('DeepSeek Translator: Context menu created');
      }
    });
  });
});

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log('DeepSeek Translator: Context menu clicked:', info);
  
  if (info.menuItemId === "translate-selection" && tab && tab.id && isValidUrl(tab.url)) {
    console.log('DeepSeek Translator: Sending translation request to tab:', tab.id);
    
    // 确保内容脚本已注入
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => {
        return typeof createSidebar !== 'undefined';
      }
    }).then((results) => {
      const isContentScriptLoaded = results[0]?.result;
      
      if (!isContentScriptLoaded) {
        // 如果内容脚本未加载，先注入它
        return chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
      }
    }).then(() => {
      // 发送翻译请求
      chrome.tabs.sendMessage(tab.id, {
        action: "translate",
        text: info.selectionText
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('DeepSeek Translator: Error sending message:', chrome.runtime.lastError);
        } else {
          console.log('DeepSeek Translator: Message sent successfully');
        }
      });
    }).catch((error) => {
      console.error('DeepSeek Translator: Error executing script:', error);
    });
  }
});

// 处理快捷键命令
chrome.commands.onCommand.addListener((command) => {
  console.log('DeepSeek Translator: Command received:', command);
  
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs.length === 0) {
      console.error('DeepSeek Translator: No active tab found');
      return;
    }
    
    const tab = tabs[0];
    if (!tab.id || !isValidUrl(tab.url)) {
      console.log('DeepSeek Translator: Cannot inject script into this page:', tab.url);
      return;
    }

    // 确保内容脚本已注入
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => {
        return typeof createSidebar !== 'undefined';
      }
    }).then((results) => {
      const isContentScriptLoaded = results[0]?.result;
      
      if (!isContentScriptLoaded) {
        // 如果内容脚本未加载，先注入它
        return chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
      }
    }).then(() => {
      if (command === "translate-selection") {
        console.log('DeepSeek Translator: Sending translate-hotkey command to tab:', tab.id);
        chrome.tabs.sendMessage(tab.id, {
          action: "translate-hotkey"
        });
      } else if (command === "toggle-sidebar") {
        console.log('DeepSeek Translator: Sending toggle-sidebar command to tab:', tab.id);
        chrome.tabs.sendMessage(tab.id, {
          action: "toggle-sidebar"
        });
      }
    }).catch((error) => {
      console.error('DeepSeek Translator: Error executing script:', error);
    });
  });
});

// 处理来自 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('DeepSeek Translator: Message received:', request);
  
  if (request.action === "get-api-key") {
    chrome.storage.sync.get(["deepseekApiKey"], (result) => {
      console.log('DeepSeek Translator: API key retrieved:', result.deepseekApiKey ? '(exists)' : '(not set)');
      sendResponse({ apiKey: result.deepseekApiKey });
    });
    return true;
  }
}); 