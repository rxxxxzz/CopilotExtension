console.log('DeepSeek Translator: Content script loaded');

let sidebar = null;
let sidebarVisible = false;

// 检查扩展上下文是否有效
function isExtensionContextValid() {
  try {
    // 尝试访问 chrome.runtime.id，如果扩展上下文无效会抛出错误
    return Boolean(chrome.runtime.id);
  } catch (e) {
    console.log('DeepSeek Translator: Extension context invalid');
    return false;
  }
}

// 保存侧边栏状态到 storage
function saveSidebarState(isVisible) {
  if (!isExtensionContextValid()) return;
  
  try {
    chrome.storage.local.set({ 
      sidebarVisible: isVisible,
      lastUpdate: Date.now()
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('DeepSeek Translator: Error saving sidebar state:', chrome.runtime.lastError);
      }
    });
  } catch (e) {
    console.error('DeepSeek Translator: Error saving sidebar state:', e);
  }
}

// 加载侧边栏状态
function loadSidebarState() {
  return new Promise((resolve) => {
    if (!isExtensionContextValid()) {
      resolve(false);
      return;
    }

    try {
      chrome.storage.local.get(['sidebarVisible', 'lastUpdate'], (result) => {
        if (chrome.runtime.lastError) {
          console.error('DeepSeek Translator: Error loading sidebar state:', chrome.runtime.lastError);
          resolve(false);
          return;
        }
        if (result.sidebarVisible !== undefined) {
          sidebarVisible = result.sidebarVisible;
        }
        resolve(sidebarVisible);
      });
    } catch (e) {
      console.error('DeepSeek Translator: Error loading sidebar state:', e);
      resolve(false);
    }
  });
}

// 更新侧边栏状态
function updateSidebarVisibility(isVisible, skipSave = false) {
  if (!isExtensionContextValid()) return;
  
  console.log('DeepSeek Translator: Updating sidebar visibility:', isVisible);
  if (!sidebar) {
    createSidebar();
  }
  if (sidebar) {
    sidebarVisible = isVisible;
    const width = sidebar.style.width.replace('px', '');
    if (isVisible) {
      sidebar.style.right = '0';
      sidebar.style.display = 'flex';
    } else {
      sidebar.style.right = `-${width}px`;
      // 添加过渡结束后隐藏侧边栏
      const handleTransitionEnd = () => {
        if (!sidebarVisible) {
          sidebar.style.display = 'none';
        }
        sidebar.removeEventListener('transitionend', handleTransitionEnd);
      };
      sidebar.addEventListener('transitionend', handleTransitionEnd);
    }
    if (!skipSave) {
      saveSidebarState(isVisible);
    }
  }
}

// 清理函数
function cleanup() {
  if (sidebar) {
    // 移除所有相关的元素
    const overlay = document.getElementById('resize-overlay');
    if (overlay) {
      overlay.remove();
    }
    
    if (sidebar.parentNode) {
      sidebar.parentNode.removeChild(sidebar);
    }
  }
  sidebar = null;
  sidebarVisible = false;
}

// 创建侧边栏
function createSidebar() {
  if (!isExtensionContextValid()) return;
  
  console.log('DeepSeek Translator: Creating sidebar');
  if (sidebar) return;

  try {
    sidebar = document.createElement('div');
    sidebar.id = 'deepseek-sidebar';
    const defaultWidth = 400;
    sidebar.style.cssText = `
      position: fixed;
      top: 0;
      right: -${defaultWidth}px;
      width: ${defaultWidth}px;
      height: 100vh;
      background: white;
      box-shadow: -2px 0 5px rgba(0,0,0,0.1);
      transition: right 0.3s ease;
      z-index: 999999;
      display: flex;
      overflow: hidden;
    `;

    // 添加调节宽度的把手
    const resizeHandle = document.createElement('div');
    resizeHandle.style.cssText = `
      position: absolute;
      top: 0;
      left: -4px;
      width: 8px;
      height: 100%;
      cursor: ew-resize;
      z-index: 1000000;
    `;

    // 处理拖动调节宽度
    let startX, startWidth, isDragging = false;
    
    function handleMouseDown(e) {
      e.preventDefault();
      startX = e.clientX;
      startWidth = parseInt(sidebar.style.width);
      isDragging = true;
      document.body.style.cursor = 'ew-resize';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      // 添加一个覆盖层防止拖动时选中文本
      const overlay = document.createElement('div');
      overlay.id = 'resize-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 999998;
        cursor: ew-resize;
        user-select: none;
      `;
      document.body.appendChild(overlay);
      
      // 禁用 iframe 的指针事件
      const iframe = sidebar.querySelector('iframe');
      if (iframe) {
        iframe.style.pointerEvents = 'none';
      }
    }

    function handleMouseMove(e) {
      if (!isDragging || !sidebar) return;
      e.preventDefault();
      
      requestAnimationFrame(() => {
        const width = Math.max(360, Math.min(800, startWidth - (e.clientX - startX)));
        sidebar.style.width = `${width}px`;
        sidebar.style.right = sidebarVisible ? '0' : `-${width}px`;
        
        // 保存宽度到存储
        if (isExtensionContextValid()) {
          chrome.storage.local.set({ sidebarWidth: width });
        }
      });
    }

    function handleMouseUp() {
      isDragging = false;
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // 移除覆盖层
      const overlay = document.getElementById('resize-overlay');
      if (overlay) {
        overlay.remove();
      }
      
      // 恢复 iframe 的指针事件
      const iframe = sidebar.querySelector('iframe');
      if (iframe) {
        iframe.style.pointerEvents = '';
      }
    }

    resizeHandle.addEventListener('mousedown', handleMouseDown);
    sidebar.appendChild(resizeHandle);

    const iframe = document.createElement('iframe');
    const sidebarUrl = chrome.runtime.getURL('sidebar.html');
    console.log('DeepSeek Translator: Loading sidebar from:', sidebarUrl);
    iframe.src = sidebarUrl;
    iframe.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      background: white;
      flex: 1;
    `;

    sidebar.appendChild(iframe);
    document.body.appendChild(sidebar);
    console.log('DeepSeek Translator: Sidebar created and added to page');

    // 加载保存的宽度
    if (isExtensionContextValid()) {
      chrome.storage.local.get(['sidebarWidth'], (result) => {
        if (result.sidebarWidth) {
          const width = result.sidebarWidth;
          sidebar.style.width = `${width}px`;
          sidebar.style.right = sidebarVisible ? '0' : `-${width}px`;
        }
      });
    }

    // 加载保存的状态
    loadSidebarState().then((isVisible) => {
      if (isVisible) {
        updateSidebarVisibility(true, true);
      }
    });

    // 监听来自 iframe 的消息
    window.addEventListener('message', handleMessage);
  } catch (e) {
    console.error('DeepSeek Translator: Error creating sidebar:', e);
    cleanup();
  }
}

// 处理消息的函数
function handleMessage(event) {
  if (!isExtensionContextValid()) {
    window.removeEventListener('message', handleMessage);
    return;
  }

  if (event.data.type === 'close-sidebar') {
    updateSidebarVisibility(false);
  }
}

async function toggleSidebar() {
  if (!isExtensionContextValid()) return;
  
  console.log('DeepSeek Translator: Toggling sidebar');
  updateSidebarVisibility(!sidebarVisible);
}

// 处理扩展消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!isExtensionContextValid()) return;

  console.log('DeepSeek Translator: Received message:', request);
  
  try {
    if (request.action === "translate") {
      const text = request.text;
      console.log('DeepSeek Translator: Translating text:', text);
      if (text) {
        if (!sidebar || !sidebarVisible) {
          updateSidebarVisibility(true);
        }
        const iframe = sidebar?.querySelector('iframe');
        if (iframe?.contentWindow) {
          console.log('DeepSeek Translator: Sending translation request to sidebar');
          iframe.contentWindow.postMessage({
            type: 'translate',
            text: text
          }, '*');
        } else {
          console.error('DeepSeek Translator: Cannot find iframe or contentWindow');
        }
      }
    } else if (request.action === "translate-hotkey") {
      const selectedText = window.getSelection().toString().trim();
      console.log('DeepSeek Translator: Hotkey translation:', selectedText);
      if (selectedText) {
        if (!sidebar || !sidebarVisible) {
          updateSidebarVisibility(true);
        }
        const iframe = sidebar?.querySelector('iframe');
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage({
            type: 'translate',
            text: selectedText
          }, '*');
        }
      }
    } else if (request.action === "toggle-sidebar") {
      console.log('DeepSeek Translator: Toggle sidebar command received');
      toggleSidebar();
    }
  } catch (e) {
    console.error('DeepSeek Translator: Error handling message:', e);
  }
});

// 初始化
function initialize() {
  if (!isExtensionContextValid()) return;
  
  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createSidebar);
    } else {
      createSidebar();
    }

    // 监听存储变化
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (!isExtensionContextValid()) return;
      
      if (namespace === 'local' && changes.sidebarVisible) {
        const newVisibility = changes.sidebarVisible.newValue;
        const lastUpdate = changes.lastUpdate?.newValue;
        
        if (sidebarVisible !== newVisibility) {
          console.log('DeepSeek Translator: Storage changed, updating sidebar visibility:', newVisibility);
          updateSidebarVisibility(newVisibility, true);
        }
      }
    });

    // 页面卸载时保存状态和清理
    window.addEventListener('beforeunload', () => {
      if (isExtensionContextValid()) {
        saveSidebarState(sidebarVisible);
      }
      cleanup();
    });

    // 监听扩展上下文变化
    window.addEventListener('unload', cleanup);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !isExtensionContextValid()) {
        cleanup();
      }
    });

  } catch (e) {
    console.error('DeepSeek Translator: Error during initialization:', e);
    cleanup();
  }
}

initialize();

console.log('DeepSeek Translator: Content script initialization complete'); 