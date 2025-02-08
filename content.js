// 添加初始化标记
if (!window.translationHelperInjected) {
  window.translationHelperInjected = true;
  
  let translatePopup = null;

  // 初始化消息监听
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Content script received message:', request);
    
    if (request.action === "getSelection") {
      const selectedText = window.getSelection().toString().trim();
      sendResponse({selectedText});
    }
    
    if (request.action === "showTranslation") {
      showTranslationPopup(request.translation);
      sendResponse({success: true});
    }
    
    return true;
  });

  // 显示翻译结果弹窗
  function showTranslationPopup(translation) {
    if (translatePopup) {
      translatePopup.remove();
    }
    
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    translatePopup = document.createElement('div');
    translatePopup.className = 'deepseek-translate-popup';
    Object.assign(translatePopup.style, {
      position: 'fixed',
      left: `${rect.left + window.scrollX}px`,
      top: `${rect.bottom + window.scrollY + 5}px`,
      zIndex: '10000',
      background: 'white',
      padding: '8px 12px',
      borderRadius: '4px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
      maxWidth: '300px',
      fontSize: '14px',
      border: '1px solid #ddd',
      maxHeight: '200px',
      overflowY: 'auto',
      lineHeight: '1.5'
    });
    
    // 添加加载动画
    translatePopup.innerHTML = `
      <div style="color: #666;">
        ${translation.startsWith('翻译失败') ? translation : translation}
      </div>
    `;
    
    document.body.appendChild(translatePopup);
    
    // 确保弹窗在视口内
    const popupRect = translatePopup.getBoundingClientRect();
    if (popupRect.right > window.innerWidth) {
      translatePopup.style.left = `${window.innerWidth - popupRect.width - 10}px`;
    }
    if (popupRect.bottom > window.innerHeight) {
      translatePopup.style.top = `${rect.top + window.scrollY - popupRect.height - 5}px`;
    }
    
    // 点击其他地方关闭弹窗
    document.addEventListener('mousedown', function closePopup(e) {
      if (translatePopup && !translatePopup.contains(e.target)) {
        translatePopup.remove();
        translatePopup = null;
        document.removeEventListener('mousedown', closePopup);
      }
    });
  }

  // 添加错误处理的辅助函数
  function handleError(error) {
    console.error('Translation error:', error);
    showTranslationPopup('翻译失败：' + (error.message || '未知错误'));
  }

  // 导出函数供其他模块使用
  window.translateHelper = {
    showTranslationPopup,
    handleError
  };
} 