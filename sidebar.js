let chats = [];
let currentChatId = null;
let messages = [];
let currentController = null;
let loadingMessageElement = null;
let loadingStartTime = 0;
const MAX_WAIT_TIME = 1800000; // 最大等待时间：30分钟

// 禁用输入
function disableInput() {
  if (userInput && sendButton) {
    userInput.disabled = true;
    sendButton.disabled = true;
    userInput.style.cursor = 'not-allowed';
    sendButton.style.cursor = 'not-allowed';
  }
}

// 启用输入
function enableInput() {
  if (userInput && sendButton) {
    userInput.disabled = false;
    sendButton.disabled = false;
    userInput.style.cursor = 'text';
    sendButton.style.cursor = 'pointer';
  }
}

const messagesContainer = document.getElementById('messages');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const newChatButton = document.getElementById('newChatButton');
const closeButton = document.getElementById('closeButton');
const chatList = document.getElementById('chatList');

// 存储限制（4MB = 4 * 1024 * 1024 字节）
const STORAGE_LIMIT = 4 * 1024 * 1024;

// 添加侧边栏切换功能
const sidebar = document.querySelector('.sidebar');
const toggleSidebarButton = document.getElementById('toggleSidebarButton');
let isSidebarCollapsed = false;

function toggleSidebar() {
  isSidebarCollapsed = !isSidebarCollapsed;
  sidebar.classList.toggle('collapsed', isSidebarCollapsed);
  toggleSidebarButton.classList.toggle('collapsed', isSidebarCollapsed);
  
  // 保存状态到 storage
  chrome.storage.local.set({ sidebarCollapsed: isSidebarCollapsed });
}

// 加载侧边栏状态
chrome.storage.local.get(['sidebarCollapsed'], (result) => {
  if (result.sidebarCollapsed) {
    isSidebarCollapsed = result.sidebarCollapsed;
    sidebar.classList.toggle('collapsed', isSidebarCollapsed);
    toggleSidebarButton.classList.toggle('collapsed', isSidebarCollapsed);
  }
});

toggleSidebarButton.addEventListener('click', toggleSidebar);

// 检查存储空间使用情况
async function checkStorageSize() {
  try {
    const data = await new Promise(resolve => {
      chrome.storage.local.get(null, resolve);
    });
    
    // 计算当前存储大小（粗略估计）
    const storageSize = new Blob([JSON.stringify(data)]).size;
    
    if (storageSize > STORAGE_LIMIT) {
      await cleanupOldChats();
    }
  } catch (e) {
    console.error('DeepSeek Translator: Error checking storage size:', e);
  }
}

// 清理旧对话
async function cleanupOldChats() {
  try {
    // 按更新时间排序
    chats.sort((a, b) => b.lastUpdate - a.lastUpdate);
    
    // 保留最近的10个对话
    if (chats.length > 10) {
      chats = chats.slice(0, 10);
      if (currentChatId && !chats.find(c => c.id === currentChatId)) {
        currentChatId = chats[0].id;
        messages = chats[0].messages;
      }
      await saveChats();
      updateChatList();
      displayMessages();
    }
  } catch (e) {
    console.error('DeepSeek Translator: Error cleaning up old chats:', e);
  }
}

// 删除对话
async function deleteChat(chatId) {
  try {
    const index = chats.findIndex(c => c.id === chatId);
    if (index === -1) return;
    
    chats.splice(index, 1);
    
    // 如果删除的是当前对话，切换到最新的对话
    if (chatId === currentChatId) {
      if (chats.length > 0) {
        currentChatId = chats[0].id;
        messages = chats[0].messages;
      } else {
        currentChatId = null;
        messages = [];
        createNewChat();
      }
    }
    
    await saveChats();
    updateChatList();
    displayMessages();
  } catch (e) {
    console.error('DeepSeek Translator: Error deleting chat:', e);
  }
}

// 关闭侧边栏
function closeSidebar() {
  window.parent.postMessage({ type: 'close-sidebar' }, '*');
}

// 生成唯一ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 创建新对话
function createNewChat() {
  const chatId = generateId();
  const chat = {
    id: chatId,
    title: '新对话',
    messages: [],
    createdAt: Date.now(),
    lastUpdate: Date.now()
  };
  chats.unshift(chat);
  saveChats();
  switchToChat(chatId);
  return chatId;
}

// 切换到指定对话
function switchToChat(chatId) {
  currentChatId = chatId;
  const chat = chats.find(c => c.id === chatId);
  if (chat) {
    messages = chat.messages;
    displayMessages();
    
    // 检查是否有正在生成的消息
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.type === 'assistant' && lastMessage.status) {
      const messageDiv = messagesContainer.lastElementChild;
      if (messageDiv) {
        if (lastMessage.status.type === 'info' && lastMessage.status.loadingStartTime) {
          loadingStartTime = lastMessage.status.loadingStartTime;
          loadingMessageElement = messageDiv;
          
          // 检查是否已经超时
          if (Date.now() - loadingStartTime >= MAX_WAIT_TIME) {
            lastMessage.status = {
              type: 'error',
              text: '等待超时，请重试',
              timestamp: Date.now()
            };
            updateMessageStatus(messageDiv, lastMessage.status.text, lastMessage.status.type);
            saveChats();
          } else {
            updateMessageStatus(messageDiv, lastMessage.status.text, lastMessage.status.type);
          }
        } else {
          updateMessageStatus(messageDiv, lastMessage.status.text, lastMessage.status.type);
        }
      }
    }
    
    updateChatList();
  }
}

// 保存所有对话
async function saveChats() {
  if (!isExtensionContextValid()) return;
  
  return new Promise((resolve, reject) => {
    const data = {
      chats: chats,
      currentChatId: currentChatId,
      lastUpdate: Date.now(),
      tabId: window.tabId // 添加标签页ID
    };
    
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

// 加载所有对话
function loadChats() {
  if (!isExtensionContextValid()) return;

  // 获取当前标签页ID
  chrome.runtime.sendMessage({ action: 'get-tab-id' }, (response) => {
    if (response && response.tabId) {
      window.tabId = response.tabId;
    }
  });

  chrome.storage.local.get(['chats', 'currentChatId', 'tabId'], (result) => {
    if (result.chats && result.chats.length > 0) {
      chats = result.chats;
      // 只有当存储的标签页ID与当前标签页ID匹配时，才使用存储的currentChatId
      if (result.tabId === window.tabId) {
        currentChatId = result.currentChatId || chats[0].id;
      } else {
        currentChatId = chats[0].id;
      }
      
      // 查找当前对话中是否有正在生成的消息
      const currentChat = chats.find(c => c.id === currentChatId);
      if (currentChat) {
        const lastMessage = currentChat.messages[currentChat.messages.length - 1];
        if (lastMessage && lastMessage.type === 'assistant' && lastMessage.status) {
          if (lastMessage.status.type === 'info' && lastMessage.status.loadingStartTime) {
            loadingStartTime = lastMessage.status.loadingStartTime;
            // 检查是否已经超时
            if (Date.now() - loadingStartTime >= MAX_WAIT_TIME) {
              lastMessage.status = {
                type: 'error',
                text: '等待超时，请重试',
                timestamp: Date.now()
              };
              saveChats();
            }
          }
        }
      }
    } else {
      createNewChat();
    }
    updateChatList();
    switchToChat(currentChatId);
  });
}

// 更新对话列表UI
function updateChatList() {
  chatList.innerHTML = '';
  chats.forEach(chat => {
    const chatItem = document.createElement('div');
    chatItem.className = `chat-item${chat.id === currentChatId ? ' active' : ''}`;
    
    // 创建对话标题容器
    const titleContainer = document.createElement('div');
    titleContainer.className = 'chat-item-content';
    titleContainer.textContent = chat.title;
    titleContainer.title = chat.title;
    titleContainer.onclick = () => switchToChat(chat.id);
    
    // 创建删除按钮
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-chat-button';
    deleteButton.innerHTML = '×';
    deleteButton.title = '删除对话';
    deleteButton.onclick = (e) => {
      e.stopPropagation();
      if (confirm('确定要删除这个对话吗？')) {
        deleteChat(chat.id);
      }
    };
    
    chatItem.appendChild(titleContainer);
    chatItem.appendChild(deleteButton);
    chatList.appendChild(chatItem);
  });
}

// 更新当前对话的标题
function updateCurrentChatTitle(firstMessage) {
  const chat = chats.find(c => c.id === currentChatId);
  if (chat && chat.title === '新对话') {
    chat.title = firstMessage.length > 20 ? firstMessage.slice(0, 20) + '...' : firstMessage;
    saveChats();
    updateChatList();
  }
}

// 显示所有消息
function displayMessages() {
  messagesContainer.innerHTML = '';
  messages.forEach(message => {
    const messageDiv = createMessageElement(message.content, message.type);
    messagesContainer.appendChild(messageDiv);
    
    // 如果消息有状态，显示状态
    if (message.type === 'assistant') {
      // 即使没有状态也创建状态区域，以保持布局一致性
      const statusArea = messageDiv.querySelector('.message-status-area');
      if (statusArea && message.status) {
        // 如果是正在生成中的消息，设置加载状态
        if (message.status.type === 'info' && message.status.loadingStartTime) {
          loadingStartTime = message.status.loadingStartTime;
          loadingMessageElement = messageDiv;
        }
        updateMessageStatus(messageDiv, message.status.text, message.status.type);
      }
    }
  });
  scrollToBottom();
}

// 滚动到底部
function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 创建消息元素
function createMessageElement(text, type) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}-message`;
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  
  if (type === 'assistant') {
    try {
      contentDiv.innerHTML = marked.parse(text || '');
    } catch (e) {
      console.error('Markdown 解析失败:', e);
      contentDiv.textContent = text || '';
    }
  } else {
    contentDiv.textContent = text;
  }
  
  messageDiv.appendChild(contentDiv);
  
  // 为助手消息添加状态区域，即使没有状态也添加
  if (type === 'assistant') {
    const statusArea = document.createElement('div');
    statusArea.className = 'message-status-area';
    messageDiv.appendChild(statusArea);
  }
  
  return messageDiv;
}

// 更新消息内容
function updateMessageContent(messageElement, text) {
  const contentDiv = messageElement.querySelector('.message-content');
  if (!contentDiv) return;

  if (messageElement.classList.contains('assistant-message')) {
    try {
      contentDiv.innerHTML = marked.parse(text || '');
    } catch (e) {
      console.error('Markdown 解析失败:', e);
      contentDiv.textContent = text || '';
    }
  } else {
    contentDiv.textContent = text;
  }
}

// 更新流式回复内容
async function updateStreamContent(chatId, content, status = null) {
  const chat = chats.find(c => c.id === chatId);
  if (chat && chat.messages.length > 0) {
    const lastMessage = chat.messages[chat.messages.length - 1];
    if (lastMessage && lastMessage.type === 'assistant') {
      // 更新消息内容
      lastMessage.content = content;
      
      // 如果提供了状态，也更新状态
      if (status) {
        lastMessage.status = status;
      }
      
      // 如果是当前对话，更新UI
      if (chat.id === currentChatId) {
        const messageDiv = messagesContainer.lastElementChild;
        if (messageDiv) {
          updateMessageContent(messageDiv, content);
          if (status) {
            updateMessageStatus(messageDiv, status.text, status.type);
          }
        }
      }
      
      // 保存到存储以同步到其他标签页
      await saveChats();
    }
  }
}

// 更新消息状态
function updateMessageStatus(messageElement, status, type = 'info') {
  const statusArea = messageElement.querySelector('.message-status-area');
  if (!statusArea) return;

  // 清除现有状态
  statusArea.innerHTML = '';

  // 创建状态容器
  const statusContainer = document.createElement('div');
  statusContainer.className = `status-container ${type}`;

  // 添加加载指示器（仅在 info 类型时）
  if (type === 'info') {
    const loader = document.createElement('div');
    loader.className = 'status-loader';
    statusContainer.appendChild(loader);
  }

  // 添加状态文本
  const statusText = document.createElement('span');
  statusText.className = 'status-text';
  statusText.textContent = status;
  statusContainer.appendChild(statusText);

  // 添加等待时间（仅在 info 类型时）
  if (type === 'info') {
    const timer = document.createElement('span');
    timer.className = 'status-timer';
    statusContainer.appendChild(timer);

    // 更新等待时间
    const updateTimer = () => {
      if (!statusArea.contains(timer)) return;
      
      const elapsed = Date.now() - loadingStartTime;
      const seconds = Math.floor(elapsed / 1000);
      const minutes = Math.floor(seconds / 60);
      timer.textContent = `已等待: ${minutes}分${seconds % 60}秒`;
      
      if (elapsed < MAX_WAIT_TIME) {
        requestAnimationFrame(updateTimer);
      } else {
        cancelChat(currentChatId, '等待超时，请重试');
      }
    };
    updateTimer();
  }

  // 添加取消按钮（仅在 info 类型时）
  if (type === 'info') {
    const cancelButton = document.createElement('button');
    cancelButton.className = 'cancel-button';
    cancelButton.textContent = '取消对话';
    cancelButton.onclick = () => {
      console.log('DeepSeek Translator: 用户取消了对话');
      cancelChat(currentChatId, '用户取消了对话');
    };
    statusContainer.appendChild(cancelButton);
  }

  statusArea.appendChild(statusContainer);
}

// 取消对话
async function cancelChat(chatId, reason) {
  // 如果当前标签页有控制器，中止它
  if (currentController) {
    currentController.abort();
    currentController = null;
  }
  
  // 保存取消状态到存储
  await chrome.storage.local.set({
    cancelledChat: {
      chatId,
      reason,
      timestamp: Date.now()
    }
  });
  
  // 立即更新本地状态
  const chat = chats.find(c => c.id === chatId);
  if (chat) {
    const lastMessage = chat.messages[chat.messages.length - 1];
    if (lastMessage && lastMessage.type === 'assistant' && lastMessage.status && lastMessage.status.type === 'info') {
      lastMessage.status = {
        type: 'warning',
        text: reason,
        timestamp: Date.now()
      };
      
      // 如果是当前对话，更新UI
      if (chat.id === currentChatId) {
        const messageDiv = messagesContainer.lastElementChild;
        if (messageDiv) {
          updateMessageStatus(messageDiv, reason, 'warning');
        }
      }
      
      await saveChats();
    }
  }
  
  // 启用输入
  enableInput();
}

// 处理对话取消
async function handleChatCancellation(cancelInfo) {
  const chat = chats.find(c => c.id === cancelInfo.chatId);
  if (chat) {
    const lastMessage = chat.messages[chat.messages.length - 1];
    if (lastMessage && lastMessage.type === 'assistant' && lastMessage.status && lastMessage.status.type === 'info') {
      // 更新消息状态
      lastMessage.status = {
        type: 'warning',
        text: cancelInfo.reason,
        timestamp: cancelInfo.timestamp
      };
      
      // 如果是当前对话，更新UI
      if (chat.id === currentChatId) {
        const messageDiv = messagesContainer.lastElementChild;
        if (messageDiv) {
          updateMessageStatus(messageDiv, cancelInfo.reason, 'warning');
        }
        if (currentController) {
          currentController.abort();
          currentController = null;
        }
      }
      
      await saveChats();
      
      // 启用输入
      enableInput();
    }
  }
}

// 添加消息到界面和存储
async function addMessage(text, type) {
  const messageDiv = createMessageElement(text, type);
  messagesContainer.appendChild(messageDiv);
  scrollToBottom();
  
  const message = { 
    content: text, 
    type: type, 
    timestamp: Date.now(),
    status: type === 'assistant' ? {
      type: 'info',
      text: '正在准备回复...',
      timestamp: Date.now()
    } : null
  };
  
  messages.push(message);
  
  // 如果是助手消息，立即显示状态栏
  if (type === 'assistant') {
    updateMessageStatus(messageDiv, message.status.text, message.status.type);
  }
  
  // 更新当前对话
  const chat = chats.find(c => c.id === currentChatId);
  if (chat) {
    chat.messages = messages;
    chat.lastUpdate = Date.now();
    if (messages.length === 1 && type === 'user') {
      updateCurrentChatTitle(text);
    }
    await saveChats();
  }
  
  return messageDiv;
}

// 处理来自 content script 的消息
window.addEventListener('message', (event) => {
  if (event.data.type === 'translate') {
    const text = event.data.text;
    const targetLang = /[\u4e00-\u9fa5]/.test(text) ? 'English' : '中文';
    userInput.value = `请将以下文本翻译成${targetLang}：\n${text}`;
    sendMessage();
  }
});

// 检查扩展上下文是否有效
function isExtensionContextValid() {
  try {
    return Boolean(chrome.runtime.id);
  } catch (e) {
    console.error('Extension context invalid:', e);
    return false;
  }
}

// 检查网络连接状态
async function checkNetworkConnection() {
  try {
    // 使用 navigator.onLine 快速检查网络状态
    if (!navigator.onLine) {
      return false;
    }

    // 尝试访问 DeepSeek API 的基本端点
    const response = await fetch('https://api.deepseek.com/v1', {
      method: 'HEAD',
      cache: 'no-cache',
      // 设置较短的超时时间
      signal: AbortSignal.timeout(5000)
    });
    return true;  // 只要能访问到域名就认为网络正常
  } catch (error) {
    // 如果是超时或网络错误，但系统显示在线，仍然返回 true
    if (navigator.onLine) {
      console.log('DeepSeek Translator: API 连接检查失败，但网络在线:', error);
      return true;
    }
    console.error('DeepSeek Translator: 网络连接检查失败:', error);
    return false;
  }
}

// 更新消息状态的辅助函数
async function updateStatus(chatId, content, status, type = 'info') {
  const statusData = {
    type,
    text: status,
    timestamp: Date.now(),
    loadingStartTime: type === 'info' ? loadingStartTime : null
  };
  
  await updateStreamContent(chatId, content || '', statusData);
}

// 发送消息
async function sendMessage() {
  const message = userInput.value.trim();
  if (!message || userInput.disabled) return;

  disableInput();
  let keepAliveCount = 0;
  let lastKeepAliveTime = 0;
  let retryCount = 0;
  const MAX_RETRIES = 100; // 设置一个较大的重试次数限制

  try {
    if (!isExtensionContextValid()) {
      throw new Error('扩展上下文已失效，请刷新页面重试');
    }

    // 检查网络连接
    const isNetworkConnected = await checkNetworkConnection();
    if (!isNetworkConnected) {
      throw new Error('网络连接不可用，请检查网络设置');
    }

    // 添加用户消息
    await addMessage(message, 'user');
    userInput.value = '';

    // 获取 API key
    const { apiKey } = await new Promise((resolve, reject) => {
      if (!isExtensionContextValid()) {
        reject(new Error('扩展上下文已失效'));
        return;
      }
      chrome.runtime.sendMessage({ action: 'get-api-key' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response || {});
        }
      });
    });

    if (!apiKey) {
      throw new Error('请先设置 API Key');
    }

    // 准备消息历史
    const messageHistory = messages.map(msg => ({
      role: msg.type === 'user' ? 'user' : 'assistant',
      content: msg.content
    }));

    // 创建一个空的助手消息元素
    const messageElement = await addMessage('', 'assistant');
    loadingMessageElement = messageElement;
    loadingStartTime = Date.now();
    
    await updateStatus(currentChatId, '', '正在等待 DeepSeek 服务器响应...');

    let currentMessage = '';
    console.log('DeepSeek Translator: 开始新的对话');

    // 创建新的 AbortController
    currentController = new AbortController();
    
    async function makeRequest() {
      console.log('DeepSeek Translator: 正在连接服务器...');
      await updateStatus(currentChatId, currentMessage, `正在连接服务器...（第 ${retryCount + 1} 次尝试）`);
      
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: messageHistory,
          stream: true,
          temperature: 0.7,
          max_tokens: 6400
        }),
        signal: currentController.signal
      });

      console.log('DeepSeek Translator: 服务器响应状态:', response.status);
      await updateStatus(currentChatId, currentMessage, `已连接到服务器，等待响应...（第 ${retryCount + 1} 次尝试）`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('DeepSeek Translator: API 错误详情:', errorData);
        
        let errorMessage = '调用 API 失败';
        if (response.status === 401) {
          errorMessage = 'API Key 无效或已过期，请检查设置';
        } else if (response.status === 429) {
          errorMessage = 'API 调用次数已达到限制';
        } else if (response.status >= 500) {
          errorMessage = 'DeepSeek 服务器暂时不可用，请稍后重试';
        }
        
        throw new Error(`${errorMessage}: ${response.status} - ${errorData.error?.message || '未知错误'}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let hasReceivedContent = false;
      let shouldRetry = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim() === '') continue;
            
            // 处理 keep-alive
            if (line.trim() === ': keep-alive') {
              keepAliveCount++;
              lastKeepAliveTime = Date.now();
              console.log(`DeepSeek Translator: 收到第 ${keepAliveCount} 个保活信号`);
              await updateStatus(currentChatId, currentMessage, `正在等待服务器响应...（第 ${retryCount + 1} 次尝试，已收到 ${keepAliveCount} 个保活信号）`);
              continue;
            }

            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                console.log('DeepSeek Translator: 收到 [DONE]');
                // 只有在没有收到任何内容的情况下才重试
                if (!hasReceivedContent) {
                  console.log('DeepSeek Translator: 未收到内容，准备重试');
                  shouldRetry = true;
                } else {
                  console.log('DeepSeek Translator: 已收到内容，完成对话');
                  await updateStatus(currentChatId, currentMessage, '回复完成', 'success');
                }
                break;
              }

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices[0]?.delta?.content || '';
                if (content) {
                  if (!hasReceivedContent) {
                    console.log('DeepSeek Translator: 开始接收内容');
                    hasReceivedContent = true;
                    await updateStatus(currentChatId, currentMessage, `正在生成回复...（第 ${retryCount + 1} 次尝试）`);
                  }
                  
                  currentMessage += content;
                  // 更新所有标签页的内容
                  await updateStreamContent(currentChatId, currentMessage);
                }
              } catch (e) {
                console.error('解析响应数据失败:', e);
              }
            }
          }

          // 检查是否超过最大等待时间
          if (Date.now() - loadingStartTime >= MAX_WAIT_TIME) {
            await updateStatus(currentChatId, currentMessage, '已达到最大等待时间（30分钟），停止重试', 'warning');
            return;
          }

          // 检查最后一次 keep-alive 是否超过 30 秒
          if (lastKeepAliveTime && Date.now() - lastKeepAliveTime > 30000 && !hasReceivedContent) {
            console.log('DeepSeek Translator: 30秒内未收到保活信号且未收到内容，准备重试');
            shouldRetry = true;
            break;
          }
        }
      } catch (e) {
        if (e.name === 'AbortError') {
          console.log('DeepSeek Translator: 流读取被中断');
          throw new Error('对话已取消');
        } else {
          throw e;
        }
      } finally {
        reader.releaseLock();
      }

      return { shouldRetry, hasReceivedContent };
    }

    // 开始重试循环
    while (retryCount < MAX_RETRIES) {
      try {
        const result = await makeRequest();
        
        if (!result.shouldRetry) {
          // 如果不需要重试，说明已经成功完成
          if (result.hasReceivedContent) {
            await updateStatus(currentChatId, currentMessage, '回复完成', 'success');
          } else {
            throw new Error('服务器没有返回有效内容');
          }
          break;
        }

        // 如果需要重试，增加重试计数
        retryCount++;
        keepAliveCount = 0;
        console.log(`DeepSeek Translator: 开始第 ${retryCount + 1} 次尝试`);
        
        // 检查是否超过最大等待时间
        if (Date.now() - loadingStartTime >= MAX_WAIT_TIME) {
          await updateStatus(currentChatId, currentMessage, '已达到最大等待时间（30分钟），停止重试', 'warning');
          break;
        }

        // 等待一小段时间再重试
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        if (error.message === '对话已取消') {
          throw error;
        }
        console.error(`DeepSeek Translator: 第 ${retryCount + 1} 次尝试失败:`, error);
        retryCount++;
        
        // 如果是致命错误，直接抛出
        if (error.message.includes('API Key') || error.message.includes('调用次数已达到限制')) {
          throw error;
        }
      }
    }
  } catch (error) {
    console.error('DeepSeek Translator: 对话错误:', error);
    if (loadingMessageElement) {
      await updateStatus(currentChatId, messages[messages.length - 1].content, error.message, 'error');
    } else {
      await addMessage(`错误: ${error.message}`, 'error');
    }
  } finally {
    enableInput();
  }
}

// 事件监听
sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

newChatButton.addEventListener('click', createNewChat);
closeButton.addEventListener('click', closeSidebar);

// 监听存储变化
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (!isExtensionContextValid()) return;
  
  if (namespace === 'local') {
    // 处理对话取消
    if (changes.cancelledChat) {
      const cancelInfo = changes.cancelledChat.newValue;
      if (cancelInfo) {
        handleChatCancellation(cancelInfo);
      }
    }
    
    // 处理对话更新
    if (changes.chats) {
      const newChats = changes.chats.newValue;
      const newCurrentChatId = changes.currentChatId?.newValue;
      const newTabId = changes.tabId?.newValue;
      
      // 更新本地数据
      if (JSON.stringify(chats) !== JSON.stringify(newChats)) {
        chats = newChats;
        
        // 如果是当前对话，更新消息显示
        const currentChat = chats.find(c => c.id === currentChatId);
        if (currentChat) {
          messages = currentChat.messages;
          displayMessages(); // 使用改进后的 displayMessages 函数
        }
        
        // 更新对话列表
        updateChatList();
      }
    }
  }
});

// 添加样式
const style = document.createElement('style');
style.textContent = `
  .chat-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    margin-bottom: 4px;
    border-radius: 4px;
    cursor: pointer;
  }
  
  .chat-item-content {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-right: 8px;
  }
  
  .delete-chat-button {
    visibility: hidden;
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 2px 6px;
    font-size: 16px;
    border-radius: 4px;
    opacity: 0.7;
  }
  
  .delete-chat-button:hover {
    background-color: var(--hover-overlay);
    opacity: 1;
  }
  
  .chat-item:hover .delete-chat-button {
    visibility: visible;
  }

  .message-status-area {
    margin-top: 8px;
    padding: 8px;
  }

  .status-container {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
    line-height: 1.4;
  }

  .status-container.info {
    background: rgba(52, 152, 219, 0.1);
    color: #2980b9;
  }

  .status-container.error {
    background: rgba(231, 76, 60, 0.1);
    color: #e74c3c;
  }

  .status-container.warning {
    background: rgba(241, 196, 15, 0.1);
    color: #f39c12;
  }

  .status-container.success {
    background: rgba(46, 204, 113, 0.1);
    color: #27ae60;
  }

  .status-loader {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(52, 152, 219, 0.2);
    border-top: 2px solid #3498db;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .status-text {
    flex-grow: 1;
  }

  .status-timer {
    font-family: monospace;
    font-size: 12px;
    opacity: 0.8;
    margin-left: 8px;
  }

  .cancel-button {
    padding: 4px 8px;
    border: none;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.1);
    color: inherit;
    cursor: pointer;
    font-size: 12px;
    opacity: 0.7;
    transition: all 0.2s ease;
  }

  .cancel-button:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.2);
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);

// 初始化
loadChats(); 