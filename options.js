document.getElementById('save').addEventListener('click', saveOptions);

// 加载已保存的设置
chrome.storage.sync.get(['apiKey'], function(items) {
  if (items.apiKey) {
    document.getElementById('apiKey').value = items.apiKey;
  }
});

function saveOptions() {
  const apiKey = document.getElementById('apiKey').value;
  
  chrome.storage.sync.set({
    apiKey: apiKey
  }, function() {
    // 更新状态显示
    const status = document.getElementById('status');
    status.textContent = '设置已保存';
    status.className = 'status success';
    status.style.display = 'block';
    
    setTimeout(function() {
      status.style.display = 'none';
    }, 2000);
  });
} 