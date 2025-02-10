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
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({
      chats: chats,
      currentChatId: currentChatId,
      lastUpdate: Date.now()
    }, () => {
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
  chrome.storage.local.get(['chats', 'currentChatId'], (result) => {
    if (result.chats && result.chats.length > 0) {
      chats = result.chats;
      currentChatId = result.currentChatId || chats[0].id;
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
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  
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

// 发送消息
async function sendMessage() {
  const message = userInput.value.trim();
  if (!message) return;

  // 添加用户消息
  await addMessage(message, 'user');
  userInput.value = '';
  sendButton.disabled = true;

  try {
    // 获取 API key
    const { apiKey } = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'get-api-key' }, resolve);
    });

    if (!apiKey) {
      throw new Error('请先设置 API Key');
    }

    // 调用 DeepSeek API
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: message }],
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status}`);
    }

    // 处理流式响应
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let currentMessage = '';
    let messageElement = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content || '';
            if (content) {
              currentMessage += content;
              if (!messageElement) {
                messageElement = await addMessage(currentMessage, 'assistant');
              } else {
                messageElement.textContent = currentMessage;
                // 更新存储中的最后一条消息
                const chat = chats.find(c => c.id === currentChatId);
                if (chat && chat.messages.length > 0) {
                  chat.messages[chat.messages.length - 1].content = currentMessage;
                  await saveChats();
                }
              }
            }
          } catch (e) {
            console.error('解析响应数据失败:', e);
          }
        }
      }
    }
  } catch (error) {
    await addMessage(`错误: ${error.message}`, 'error');
  } finally {
    sendButton.disabled = false;
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
  if (namespace === 'local' && changes.chats) {
    const newChats = changes.chats.newValue;
    const newCurrentChatId = changes.currentChatId?.newValue;
    
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