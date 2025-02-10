// Markdown 解析器
const marked = {
  escapeHtml: function(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
  
  parse: function(text) {
    if (!text) return '';
    
    // 首先转义 HTML
    text = this.escapeHtml(text);
    
    // 基本的 Markdown 解析规则
    return text
      // 代码块
      .replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
        const language = lang || '代码';
        return `<div class="code-container">
          <div class="code-header">
            <span>${language}</span>
          </div>
          <pre class="code-content"><code>${code.trim()}</code></pre>
        </div>`;
      })
      // 行内代码
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // 标题
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      // 列表（支持多级列表）
      .replace(/^[\s]*[-*+] (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)\n/g, '<ul>$1</ul>')
      .replace(/^[\s]*\d+\. (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)\n/g, '<ol>$1</ol>')
      // 引用
      .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
      // 粗体和斜体
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      // 链接
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      // 图片
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
      // 水平线
      .replace(/^---$/gm, '<hr>')
      // 段落（处理连续的换行）
      .replace(/\n\s*\n/g, '</p><p>')
      // 确保所有内容都在段落中
      .replace(/^([^<].*)/gm, '<p>$1</p>')
      // 清理空段落
      .replace(/<p>\s*<\/p>/g, '')
      // 修复嵌套标签问题
      .replace(/<\/p><p>/g, '</p>\n<p>');
  }
}; 