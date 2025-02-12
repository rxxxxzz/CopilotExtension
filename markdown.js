// Markdown 解析器
const marked = {
  escapeHtml: function(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
  
  parse: function(text) {
    if (!text) return '';
    
    // 存储代码块，防止内部内容被解析
    const codeBlocks = [];
    text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
      codeBlocks.push({ lang: lang || '代码', code: code.trim() });
      return placeholder;
    });
    
    // 存储行内代码
    const inlineCode = [];
    text = text.replace(/`([^`]+)`/g, (match, code) => {
      const placeholder = `__INLINE_CODE_${inlineCode.length}__`;
      inlineCode.push(code);
      return placeholder;
    });
    
    // 基本的 Markdown 解析规则
    text = this.escapeHtml(text)
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

    // 恢复代码块
    codeBlocks.forEach((block, index) => {
      const placeholder = `__CODE_BLOCK_${index}__`;
      const replacement = `<div class="code-container">
        <div class="code-header">
          <span>${block.lang}</span>
        </div>
        <pre class="code-content"><code>${block.code}</code></pre>
      </div>`;
      text = text.replace(placeholder, replacement);
    });

    // 恢复行内代码
    inlineCode.forEach((code, index) => {
      const placeholder = `__INLINE_CODE_${index}__`;
      text = text.replace(placeholder, `<code>${code}</code>`);
    });

    return text;
  }
}; 