let activeTabId = null;

// 跟踪活动标签页
chrome.tabs.onActivated.addListener(function(activeInfo) {
  activeTabId = activeInfo.tabId;
});

// 跟踪标签页更新
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && tab.active) {
    activeTabId = tabId;
  }
});

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

const API_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';

async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['apiKey'], function(items) {
      resolve(items.apiKey);
    });
  });
}

// 添加连接监听器
chrome.runtime.onConnect.addListener(function(port) {
  if (port.name === 'chat-stream') {
    port.onDisconnect.addListener(() => {
      console.log('聊天流已断开连接');
    });
  }
});

// 修改消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    handleTranslation(request.text)
      .then(translation => sendResponse({translation}))
      .catch(error => sendResponse({error: error.message}));
    return true;
  }
  
  if (request.action === 'chat') {
    (async () => {
      try {
        // 先发送初始响应
        sendResponse({ type: 'start' });
        
        // 等待连接建立
        const port = await new Promise(resolve => {
          const listener = (port) => {
            if (port.name === 'chat-stream') {
              chrome.runtime.onConnect.removeListener(listener);
              resolve(port);
            }
          };
          chrome.runtime.onConnect.addListener(listener);
        });

        const stream = await handleChat(request.message);
        let fullResponse = '';

        try {
          for await (const chunk of stream) {
            fullResponse += chunk;
            if (port) {
              port.postMessage({
                type: 'chunk',
                content: chunk
              });
            }
          }

          // 更新对话历史
          conversationHistory.push({ 
            role: "assistant", 
            content: fullResponse 
          });

          // 发送完成信号
          if (port) {
            port.postMessage({ type: 'end' });
          }
        } catch (error) {
          if (port) {
            port.postMessage({
              type: 'error',
              error: error.message
            });
          }
        }
      } catch (error) {
        console.error('Chat Error:', error);
        if (sendResponse) {
          sendResponse({
            type: 'error',
            error: error.message
          });
        }
      }
    })();
    return true;
  }
});

let conversationHistory = [];
const MAX_HISTORY_LENGTH = 10; // 限制历史消息数量

async function handleChat(message) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('请先设置 API 密钥');
  }

  // 更新对话历史
  conversationHistory.push({ role: "user", content: message });
  if (conversationHistory.length > MAX_HISTORY_LENGTH * 2) {
    conversationHistory = conversationHistory.slice(-MAX_HISTORY_LENGTH * 2);
  }

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: new Headers({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }),
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: conversationHistory,
        temperature: 0.7,
        stream: true  // 启用流式响应
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`请求失败: ${response.status} ${response.statusText}`);
    }

    // 获取响应的可读流
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    // 修改消息监听器处理方式
    return {
      async *[Symbol.asyncIterator]() {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(line => line.trim() !== '');
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;
                
                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices[0]?.delta?.content || '';
                  if (content) {
                    fullResponse += content;
                    yield content;
                  }
                } catch (e) {
                  console.error('解析响应数据失败:', e);
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      }
    };
  } catch (error) {
    console.error('Chat Error:', error);
    throw error;
  }
}

// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translate-selection",
    title: "翻译选中文本",
    contexts: ["selection"]
  });
});

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "translate-selection") {
    handleContextMenuTranslate(info.selectionText, tab);
  }
});

// 检查URL是否可以注入脚本
function isValidUrl(url) {
  if (!url) return false;
  
  const invalidPrefixes = [
    'chrome://',
    'chrome-extension://',
    'chrome-search://',
    'chrome-devtools://',
    'about:',
    'edge://',
    'brave://',
    'opera://',
    'vivaldi://',
    'file://',
    'view-source:',
    'data:',
    'javascript:',
    'https://chrome.google.com/webstore'
  ];
  
  return !invalidPrefixes.some(prefix => url.toLowerCase().startsWith(prefix));
}

// 修改处理右键菜单和快捷键的翻译函数
async function handleContextMenuTranslate(text, tab) {
  if (!tab?.id || !isValidUrl(tab.url)) {
    console.log('无法在此页面使用翻译功能');
    return;
  }

  try {
    const translation = await handleTranslation(text);
    
    // 注入内容脚本（如果尚未注入）
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => {
          // 检查是否已经注入
          if (window.translationHelperInjected) return;
          window.translationHelperInjected = true;
        }
      });
    } catch (error) {
      console.error('Script injection error:', error);
      return; // 如果注入失败，直接返回
    }

    // 等待一小段时间确保内容脚本已加载
    await new Promise(resolve => setTimeout(resolve, 100));

    // 发送翻译结果到内容脚本
    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: "showTranslation",
        text: text,
        translation: translation
      });
    } catch (error) {
      console.error('Failed to send translation to content script:', error);
      if (isValidUrl(tab.url)) {
        // 只在有效的URL上尝试重新注入
        await injectContentScript(tab.id);
        // 重试发送消息
        await chrome.tabs.sendMessage(tab.id, {
          action: "showTranslation",
          text: text,
          translation: translation
        });
      }
    }
  } catch (error) {
    console.error('Translation error:', error);
    if (isValidUrl(tab.url)) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: "showTranslation",
          text: text,
          translation: "翻译失败：" + error.message
        });
      } catch (sendError) {
        console.error('Failed to send error message to content script:', sendError);
      }
    }
  }
}

// 修改快捷键处理函数
chrome.commands.onCommand.addListener((command) => {
  if (command === "translate-selection") {
    chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
      const tab = tabs[0];
      
      // 提前检查URL有效性
      if (!tab?.id || !tab.url || !isValidUrl(tab.url)) {
        console.log('无法在此页面使用翻译功能:', tab?.url);
        return;
      }
      
      try {
        // 先检查是否已经注入了内容脚本
        let isInjected = false;
        try {
          const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => window.translationHelperInjected || false
          });
          isInjected = result;
        } catch (error) {
          console.log('检查脚本注入状态失败:', error);
          return;
        }

        // 如果还没有注入，则注入内容脚本
        if (!isInjected) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content.js']
            });
            // 等待脚本加载
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error) {
            console.error('内容脚本注入失败:', error);
            return;
          }
        }

        // 获取选中的文本
        try {
          const response = await chrome.tabs.sendMessage(tab.id, {
            action: "getSelection"
          });
          
          if (response?.selectedText) {
            await handleContextMenuTranslate(response.selectedText, tab);
          } else {
            console.log('没有选中文本');
          }
        } catch (error) {
          console.error('获取选中文本失败:', error);
        }
      } catch (error) {
        console.error('翻译操作失败:', error);
      }
    });
  }
});

// 修改内容脚本注入函数，添加更多错误处理
async function injectContentScript(tabId) {
  try {
    // 先检查标签页URL是否有效
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !isValidUrl(tab.url)) {
      console.log('无法在此页面注入脚本:', tab.url);
      return;
    }

    // 检查是否已经注入
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.translationHelperInjected || false
      });
      
      if (result) {
        console.log('内容脚本已经注入');
        return;
      }
    } catch (error) {
      console.log('检查脚本注入状态失败:', error);
      return;
    }

    // 注入内容脚本
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    
    console.log('内容脚本注入成功');
  } catch (error) {
    console.error('内容脚本注入失败:', error);
    throw error;
  }
}

async function handleTranslation(text) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('请先设置 API 密钥');
  }

  try {
    const isChinese = /[\u4e00-\u9fa5]/.test(text);
    const systemPrompt = isChinese 
      ? "Translate the following Chinese text to English. Only return the translation."
      : "Translate the following text to Chinese. Only return the translation.";

    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: new Headers({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }),
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Translation API Error Response:', errorText);
      throw new Error(`请求失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Translation API Response:', data);

    if (!data.choices?.[0]?.message?.content) {
      throw new Error('API 返回的数据结构不正确');
    }

    return data.choices[0].message.content;
  } catch (error) {
    console.error('Translation Error:', error);
    throw error;
  }
} 