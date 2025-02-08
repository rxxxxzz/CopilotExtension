const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');

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
  
  // 添加用户消息到界面
  addMessage(message, 'user');
  userInput.value = '';
  sendButton.disabled = true;
  
  // 显示加载状态
  const loadingMessage = addMessage('正在思考...', 'bot');
  
  try {
    // 发送消息给 background.js 处理
    const response = await chrome.runtime.sendMessage({
      action: 'chat',
      message: message
    });
    
    // 移除加载状态并显示回复
    loadingMessage.remove();
    addMessage(response.response, 'bot');
  } catch (error) {
    // 移除加载状态并显示错误
    loadingMessage.remove();
    addMessage('发送消息失败：' + error.message, 'bot');
  } finally {
    sendButton.disabled = false;
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