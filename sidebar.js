let chatHistory = [];
const MAX_DISPLAYED_MESSAGES = 50; // 限制显示的消息数量
let saveTimeout = null; // 添加这行，定义 saveTimeout 变量

document.addEventListener('DOMContentLoaded', function() {
  const chatMessages = document.getElementById('chat-messages');
  const userInput = document.getElementById('user-input');
  const sendButton = document.getElementById('send-button');

  let currentMessageElement = null;
  let port = null;

  // 使用虚拟滚动优化消息显示
  let messageContainer = document.createElement('div');
  messageContainer.style.minHeight = '100%';
  chatMessages.appendChild(messageContainer);

  // 加载历史消息时进行限制
  chrome.storage.local.get(['chatHistory'], function(result) {
    if (result.chatHistory) {
      chatHistory = result.chatHistory.slice(-MAX_DISPLAYED_MESSAGES);
      chatHistory.forEach(msg => addMessage(msg.content, msg.type));
    }
  });

  // 优化输入框高度自适应
  let resizeTimeout;
  userInput.addEventListener('input', function() {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    }, 10);
  });

  sendButton.addEventListener('click', sendMessage);
  userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  async function sendMessage() {
    const message = userInput.value.trim();
    if (!message) return;
    
    userInput.value = '';
    userInput.style.height = 'auto';
    sendButton.disabled = true;
    
    // 添加用户消息
    addMessage(message, 'user');
    chatHistory.push({ content: message, type: 'user' });
    
    try {
      // 创建一个新的消息元素用于显示助手的响应
      currentMessageElement = document.createElement('div');
      currentMessageElement.className = 'message bot-message';
      chatMessages.appendChild(currentMessageElement);
      
      // 先建立连接
      port = chrome.runtime.connect({ name: 'chat-stream' });
      
      // 设置消息监听器
      port.onMessage.addListener((msg) => {
        if (msg.type === 'chunk') {
          // 追加新的内容
          if (currentMessageElement) {
            currentMessageElement.textContent += msg.content;
            // 滚动到底部
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }
        } else if (msg.type === 'end') {
          // 保存消息到历史记录
          if (currentMessageElement) {
            chatHistory.push({ 
              content: currentMessageElement.textContent, 
              type: 'bot' 
            });
            
            // 使用防抖保存历史记录
            if (saveTimeout) clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
              chrome.storage.local.set({ 
                chatHistory: chatHistory.slice(-MAX_DISPLAYED_MESSAGES) 
              });
            }, 1000);
          }
          
          // 清理连接
          port.disconnect();
          port = null;
          currentMessageElement = null;
        } else if (msg.type === 'error') {
          if (currentMessageElement) {
            currentMessageElement.textContent = '错误：' + msg.error;
          }
          // 清理连接
          port.disconnect();
          port = null;
          currentMessageElement = null;
        }
      });

      // 发送消息触发流式响应
      chrome.runtime.sendMessage({
        action: 'chat',
        message: message
      }, (response) => {
        if (response?.type === 'error') {
          if (currentMessageElement) {
            currentMessageElement.textContent = '错误：' + response.error;
          }
          if (port) {
            port.disconnect();
            port = null;
          }
          currentMessageElement = null;
        }
      });

    } catch (error) {
      console.error('发送消息失败:', error);
      if (currentMessageElement) {
        currentMessageElement.textContent = '发送消息失败：' + error.message;
      }
      if (port) {
        port.disconnect();
        port = null;
      }
    } finally {
      sendButton.disabled = false;
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  function addMessage(text, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}-message`;
    messageDiv.textContent = text;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return messageDiv;
  }

  function addLoadingIndicator() {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading';
    loadingDiv.innerHTML = `
      <div class="loading-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return loadingDiv;
  }
}); 