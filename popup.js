document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const saveButton = document.getElementById('saveButton');
  const statusDiv = document.getElementById('status');

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

  // 加载已保存的 API key
  chrome.storage.sync.get(['deepseekApiKey'], (result) => {
    if (result.deepseekApiKey) {
      apiKeyInput.value = result.deepseekApiKey;
    }
  });

  // 保存 API key
  saveButton.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
      showStatus('请输入 API Key', 'error');
      return;
    }

    try {
      // 保存 API Key
      await new Promise((resolve, reject) => {
        chrome.storage.sync.set({ deepseekApiKey: apiKey }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

      showStatus('API Key 已保存', 'success');
      
      // 获取当前标签页
      const tabs = await chrome.tabs.query({active: true, currentWindow: true});
      const tab = tabs[0];
      
      if (!tab || !tab.id) {
        console.error('DeepSeek Translator: No active tab found');
        return;
      }

      if (!isValidUrl(tab.url)) {
        console.log('DeepSeek Translator: Cannot inject script into this page:', tab.url);
        showStatus('当前页面不支持翻译功能', 'error');
        return;
      }

      try {
        // 检查内容脚本是否已加载
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: () => {
            return typeof createSidebar !== 'undefined';
          }
        });

        const isContentScriptLoaded = results[0]?.result;

        // 如果内容脚本未加载，注入它
        if (!isContentScriptLoaded) {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
        }

        // 发送打开侧边栏的消息
        chrome.tabs.sendMessage(tab.id, {
          action: "toggle-sidebar"
        });

        // 延迟关闭弹出窗口
        setTimeout(() => {
          window.close();
        }, 1000);

      } catch (error) {
        console.error('DeepSeek Translator: Error injecting content script:', error);
        if (error.message.includes('cannot access a chrome:// URL')) {
          showStatus('当前页面不支持翻译功能', 'error');
        } else {
          showStatus('无法初始化翻译功能', 'error');
        }
      }
    } catch (error) {
      console.error('DeepSeek Translator: Error saving API key:', error);
      showStatus('保存 API Key 失败', 'error');
    }
  });

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.style.display = 'block';
    statusDiv.style.color = type === 'error' ? '#d32f2f' : '#1a73e8';
    
    if (type === 'success') {
      setTimeout(() => {
        statusDiv.style.display = 'none';
      }, 2000);
    }
  }
}); 