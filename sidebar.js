let chats = [];
let currentChatId = null;
let messages = [];

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
  messageDiv.textContent = text;
  return messageDiv;
}

// 添加消息到界面和存储
async function addMessage(text, type) {
  const messageDiv = createMessageElement(text, type);
  messagesContainer.appendChild(messageDiv);
  scrollToBottom();
  
  const message = { content: text, type: type, timestamp: Date.now() };
  messages.push(message);
  
  // 更新当前对话
  const chat = chats.find(c => c.id === currentChatId);
  if (chat) {
    chat.messages = messages;
    chat.lastUpdate = Date.now();
    if (messages.length === 1 && type === 'user') {
      updateCurrentChatTitle(text);
    }
    await saveChats();
    await checkStorageSize();
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

// 发送消息
async function sendMessage() {
  const message = userInput.value.trim();
  if (!message) return;

  // 禁用输入和发送按钮
  userInput.disabled = true;
  sendButton.disabled = true;

  try {
    if (!isExtensionContextValid()) {
      throw new Error('扩展上下文已失效，请刷新页面重试');
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
    let currentMessage = '';

    // 调用 DeepSeek API
    const controller = new AbortController();
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
        max_tokens: 2000
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`API 请求失败: ${response.status} - ${errorData.error?.message || '未知错误'}`);
    }

    // 处理流式响应
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content || '';
              if (content) {
                currentMessage += content;
                messageElement.textContent = currentMessage;

                // 立即更新存储中的最后一条消息
                if (isExtensionContextValid()) {
                  const chat = chats.find(c => c.id === currentChatId);
                  if (chat && chat.messages.length > 0) {
                    chat.messages[chat.messages.length - 1].content = currentMessage;
                    // 使用 requestIdleCallback 或 setTimeout 来异步保存
                    if (window.requestIdleCallback) {
                      requestIdleCallback(() => saveChats());
                    } else {
                      setTimeout(() => saveChats(), 0);
                    }
                  }
                }

                // 使用 requestAnimationFrame 来优化滚动性能
                requestAnimationFrame(() => scrollToBottom());
              }
            } catch (e) {
              console.error('解析响应数据失败:', e);
            }
          }
        }
      }
      // 处理剩余的缓冲区
      if (buffer.trim() && buffer.startsWith('data: ')) {
        try {
          const data = buffer.slice(6);
          if (data !== '[DONE]') {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content || '';
            if (content) {
              currentMessage += content;
              messageElement.textContent = currentMessage;
              if (isExtensionContextValid()) {
                const chat = chats.find(c => c.id === currentChatId);
                if (chat && chat.messages.length > 0) {
                  chat.messages[chat.messages.length - 1].content = currentMessage;
                  await saveChats();
                }
              }
              scrollToBottom();
            }
          }
        } catch (e) {
          console.error('解析最后的响应数据失败:', e);
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        console.log('Stream reading aborted');
      } else {
        throw e;
      }
    } finally {
      reader.releaseLock();
      controller.abort();
    }
  } catch (error) {
    console.error('API 调用错误:', error);
    // 移除空的助手消息（如果存在）
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.type === 'assistant' && lastMessage.content === '') {
      messages.pop();
      if (isExtensionContextValid()) {
        await saveChats();
      }
      displayMessages();
    }
    await addMessage(`错误: ${error.message}`, 'error');
  } finally {
    // 重新启用输入和发送按钮
    userInput.disabled = false;
    sendButton.disabled = false;
    userInput.focus();
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
  
  if (namespace === 'local' && changes.chats) {
    const newChats = changes.chats.newValue;
    const newCurrentChatId = changes.currentChatId?.newValue;
    const newTabId = changes.tabId?.newValue;
    
    // 只有当存储的标签页ID与当前标签页ID匹配时，才更新界面
    if (newTabId === window.tabId) {
      if (JSON.stringify(chats) !== JSON.stringify(newChats)) {
        chats = newChats;
        if (newCurrentChatId && newCurrentChatId !== currentChatId) {
          switchToChat(newCurrentChatId);
        } else {
          const currentChat = chats.find(c => c.id === currentChatId);
          if (currentChat) {
            messages = currentChat.messages;
            displayMessages();
          }
          updateChatList();
        }
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
`;
document.head.appendChild(style);

// 初始化
loadChats(); 