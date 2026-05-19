// ==UserScript==
// @name         知乎专栏转Markdown
// @name:en      Zhihu to Markdown
// @namespace    https://github.com/RustyPiano/zhihu-to-markdown
// @version      1.0.0
// @description  一键将知乎专栏文章转换为Markdown格式，完美支持LaTeX数学公式
// @description:en  Convert Zhihu articles to Markdown with one click, with full LaTeX math support
// @author       RustyPiano
// @license      MIT
// @homepage     https://github.com/RustyPiano/zhihu-to-markdown
// @supportURL   https://github.com/RustyPiano/zhihu-to-markdown/issues
// @match        https://zhuanlan.zhihu.com/p/*
// @match        https://www.zhihu.com/question/*/answer/*
// @icon         https://static.zhihu.com/heifetz/favicon.ico
// @grant        GM_setClipboard
// @grant        GM_notification
// @run-at       document-idle
// ==/UserScript==

/**
 * 知乎专栏转Markdown
 * 
 * 功能特性：
 * - 一键转换知乎专栏文章为Markdown格式
 * - 自动识别行内公式和块级公式（以\\结尾的为块级公式）
 * - 自动替换 \bm 为 \boldsymbol（兼容Typora等编辑器）
 * - 支持标题、引用、列表、链接、图片等常见元素
 * - 转换后自动复制到剪贴板
 * 
 * 使用方法：
 * 1. 安装 Tampermonkey 或 Greasemonkey 浏览器扩展
 * 2. 安装本脚本
 * 3. 访问知乎专栏文章页面
 * 4. 点击页面右上角的「📋 转为Markdown」按钮
 * 5. Markdown内容将自动复制到剪贴板
 */

(function () {
    'use strict';

    // ==================== 配置 ====================
    const CONFIG = {
        // 按钮样式
        button: {
            top: '80px',
            right: '20px',
            background: '#3f3f46',
        },
        // 通知显示时间（毫秒）
        notificationDuration: 2000,
    };

    // ==================== 核心解析逻辑 ====================

    /**
     * 解析HTML元素为Markdown文本
     * @param {Node} element - 要解析的DOM节点
     * @returns {string} Markdown文本
     */
    function parseElement(element) {
        // 文本节点
        if (element.nodeType === Node.TEXT_NODE) {
            return element.textContent.replace(/\s+/g, ' ');
        }

        // 非元素节点跳过
        if (element.nodeType !== Node.ELEMENT_NODE) {
            return '';
        }

        const tagName = element.tagName.toLowerCase();

        // 数学公式 <span class="ztext-math">
        if (tagName === 'span' && element.classList.contains('ztext-math')) {
            return parseMathFormula(element);
        }

        // 链接 <a>
        if (tagName === 'a') {
            return parseLink(element);
        }

        // 换行 <br>
        if (tagName === 'br') {
            return '\n';
        }

        // 粗体
        if (tagName === 'strong' || tagName === 'b') {
            const text = parseChildren(element).trim();
            return text ? `**${text}**` : '';
        }

        // 斜体
        if (tagName === 'em' || tagName === 'i') {
            const text = parseChildren(element).trim();
            return text ? `*${text}*` : '';
        }

        // 行内代码
        if (tagName === 'code') {
            return `\`${element.textContent}\``;
        }

        // 代码块
        if (tagName === 'pre') {
            const code = element.querySelector('code');
            const language = code?.className.match(/language-(\w+)/)?.[1] || '';
            const content = code?.textContent || element.textContent;
            return `\n\n\`\`\`${language}\n${content}\n\`\`\`\n\n`;
        }

        // 段落
        if (tagName === 'p') {
            if (element.classList.contains('ztext-empty-paragraph')) {
                return '\n\n';
            }
            const content = parseChildren(element).trim();
            return content ? `\n\n${content}\n\n` : '';
        }

        // 引用块
        if (tagName === 'blockquote') {
            return parseBlockquote(element);
        }

        // 标题 h1-h6
        if (/^h[1-6]$/.test(tagName)) {
            const level = parseInt(tagName[1]);
            const content = parseChildren(element).trim();
            return `\n\n${'#'.repeat(level)} ${content}\n\n`;
        }

        // 列表
        if (tagName === 'ul' || tagName === 'ol') {
            return parseList(element, tagName);
        }

        // 图片
        if (tagName === 'img') {
            return parseImage(element);
        }

        // figure（通常包含图片）
        if (tagName === 'figure') {
            const content = parseChildren(element).trim();
            return `\n\n${content}\n\n`;
        }

        // 图片说明
        if (tagName === 'figcaption') {
            const content = parseChildren(element).trim();
            return content ? `\n*${content}*\n` : '';
        }

        // 知乎搜索实体链接
        if (tagName === 'span' && element.hasAttribute('data-search-entity')) {
            return element.textContent;
        }

        // 分隔线
        if (tagName === 'hr') {
            return '\n\n---\n\n';
        }

        // 默认：递归解析子元素
        return parseChildren(element);
    }

    /**
     * 解析子元素
     */
    function parseChildren(element) {
        return Array.from(element.childNodes).map(parseElement).join('');
    }

    /**
     * 解析数学公式
     */
    function parseMathFormula(element) {
        let tex = element.getAttribute('data-tex') || '';

        // 替换 \bm 为 \boldsymbol（Typora等编辑器兼容）
        tex = tex.replace(/\\bm\b/g, '\\boldsymbol');

        // 判断是否为块级公式：以 \\ 结尾
        const isBlock = tex.trim().endsWith('\\\\');

        if (isBlock) {
            // 块级公式：去掉末尾的 \\
            tex = tex.trim().replace(/\\\\$/, '').trim();
            return `\n\n$$\n${tex}\n$$\n\n`;
        } else {
            // 行内公式
            return `$${tex}$`;
        }
    }

    /**
     * 解析链接
     */
    function parseLink(element) {
        const href = element.getAttribute('href') || '';
        const text = parseChildren(element).trim();

        // 过滤知乎内部搜索链接（保留文本但不保留链接）
        if (href.includes('zhida.zhihu.com/search')) {
            return text;
        }

        if (href && text) {
            return `[${text}](${href})`;
        }
        return text;
    }

    /**
     * 解析引用块
     */
    function parseBlockquote(element) {
        const content = parseChildren(element).trim();
        const lines = content.split('\n').filter(line => line.trim());
        const quoted = lines.map(line => `> ${line.trim()}`).join('\n');
        return `\n\n${quoted}\n\n`;
    }

    /**
     * 解析列表
     */
    function parseList(element, tagName) {
        const items = Array.from(element.querySelectorAll(':scope > li')).map((li, i) => {
            const content = parseChildren(li).trim();
            return tagName === 'ul' ? `- ${content}` : `${i + 1}. ${content}`;
        });
        return `\n\n${items.join('\n')}\n\n`;
    }

    /**
     * 解析图片
     */
    function parseImage(element) {
        const src = element.getAttribute('src') ||
            element.getAttribute('data-src') ||
            element.getAttribute('data-original') || '';
        const alt = element.getAttribute('alt') || '';
        return src ? `![${alt}](${src})` : '';
    }

    // ==================== 工具函数 ====================

    /**
     * 规范化空白字符
     */
    function normalizeWhitespace(text) {
        const lines = text.split('\n');
        const normalizedLines = [];
        let inCodeBlock = false;

        for (const line of lines) {
            if (/^\s*```/.test(line)) {
                normalizedLines.push(line.trim());
                inCodeBlock = !inCodeBlock;
                continue;
            }

            normalizedLines.push(inCodeBlock ? line.replace(/\s+$/g, '') : line.trim());
        }

        const compactedLines = [];
        let blankLines = 0;
        inCodeBlock = false;

        for (const line of normalizedLines) {
            if (/^```/.test(line)) {
                compactedLines.push(line);
                inCodeBlock = !inCodeBlock;
                blankLines = 0;
                continue;
            }

            if (!inCodeBlock && line === '') {
                blankLines += 1;
                if (blankLines <= 1) {
                    compactedLines.push(line);
                }
                continue;
            }

            blankLines = 0;
            compactedLines.push(line);
        }

        return compactedLines.join('\n').trim();
    }

    /**
     * 获取文章标题
     */
    function getTitle() {
        const selectors = [
            'h1.Post-Title',
            '.QuestionHeader-title',
            'h1[data-zop]',
            'title'
        ];

        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) {
                let title = el.textContent.trim();
                title = title.replace(/\s*-\s*知乎$/, '');
                return title;
            }
        }
        return '';
    }

    /**
     * 转换为Markdown
     */
    function convertToMarkdown() {
        // 查找文章内容区域
        const contentSelectors = [
            '.RichText.ztext.Post-RichText',
            '.RichText.ztext.css-1g0fqss',
            '.RichText.ztext',
            '.Post-RichTextContainer .RichText'
        ];

        let contentDiv = null;
        for (const selector of contentSelectors) {
            contentDiv = document.querySelector(selector);
            if (contentDiv) break;
        }

        if (!contentDiv) {
            alert('❌ 未找到文章内容区域\n\n请确保当前页面是知乎专栏文章或回答页面。');
            return null;
        }

        // 解析内容
        let markdown = parseChildren(contentDiv);
        markdown = normalizeWhitespace(markdown);

        // 添加标题
        const title = getTitle();
        if (title) {
            markdown = `# ${title}\n\n${markdown}`;
        }

        return markdown;
    }

    // ==================== UI 组件 ====================

    /**
     * 创建转换按钮
     */
    function createButton() {
        const btn = document.createElement('button');
        btn.textContent = '转为Markdown';
        btn.id = 'zhihu-to-markdown-btn';

        Object.assign(btn.style, {
            position: 'fixed',
            top: CONFIG.button.top,
            right: CONFIG.button.right,
            zIndex: '9999',
            padding: '10px 16px',
            background: CONFIG.button.background,
            color: 'white',
            border: '1px solid #27272a',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08)',
            transition: 'background-color 0.2s ease, box-shadow 0.2s ease',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        });

        // 悬停效果
        btn.addEventListener('mouseenter', () => {
            btn.style.background = '#27272a';
            btn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.18)';
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.background = CONFIG.button.background;
            btn.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.08)';
        });

        // 点击事件
        btn.addEventListener('click', handleConvert);

        document.body.appendChild(btn);
    }

    /**
     * 处理转换
     */
    function handleConvert() {
        const markdown = convertToMarkdown();
        if (!markdown) return;

        // 复制到剪贴板
        copyToClipboard(markdown);
    }

    /**
     * 复制到剪贴板
     */
    function copyToClipboard(text) {
        // 优先使用 GM_setClipboard
        if (typeof GM_setClipboard !== 'undefined') {
            GM_setClipboard(text, 'text');
            showNotification('✅ 已复制到剪贴板！', 'success');
            return;
        }

        // 降级使用 navigator.clipboard
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                showNotification('✅ 已复制到剪贴板！', 'success');
            }).catch(() => {
                showModal(text);
            });
            return;
        }

        // 最后降级：显示模态框供手动复制
        showModal(text);
    }

    /**
     * 显示通知
     */
    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.textContent = message;

        const bgColor = type === 'success' ? '#10b981' : '#ef4444';

        Object.assign(notification.style, {
            position: 'fixed',
            top: '130px',
            right: '20px',
            zIndex: '10000',
            padding: '12px 20px',
            background: bgColor,
            color: 'white',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            boxShadow: `0 4px 15px ${bgColor}66`,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            opacity: '0',
            transform: 'translateX(20px)',
            transition: 'all 0.3s ease',
        });

        document.body.appendChild(notification);

        // 动画显示
        requestAnimationFrame(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        });

        // 自动消失
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(20px)';
            setTimeout(() => notification.remove(), 300);
        }, CONFIG.notificationDuration);
    }

    /**
     * 显示模态框（降级方案）
     */
    function showModal(content) {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            background: 'rgba(0,0,0,0.5)',
            zIndex: '10000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        });

        const modal = document.createElement('div');
        Object.assign(modal.style, {
            background: 'white',
            borderRadius: '12px',
            padding: '20px',
            maxWidth: '80%',
            maxHeight: '80%',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        });

        modal.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h3 style="margin: 0; font-size: 18px;">📄 Markdown 内容</h3>
                <button id="modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer; padding: 5px; color: #666;">&times;</button>
            </div>
            <textarea id="modal-textarea" readonly style="
                flex: 1;
                width: 600px;
                height: 400px;
                font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
                font-size: 13px;
                padding: 12px;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                resize: none;
                line-height: 1.5;
            ">${content}</textarea>
            <button id="modal-copy" style="
                margin-top: 15px;
                padding: 12px 24px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
            ">复制全部内容</button>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // 事件绑定
        document.getElementById('modal-close').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        document.getElementById('modal-copy').onclick = () => {
            const textarea = document.getElementById('modal-textarea');
            textarea.select();
            document.execCommand('copy');
            const btn = document.getElementById('modal-copy');
            btn.textContent = '✅ 已复制！';
            btn.style.background = '#10b981';
            setTimeout(() => {
                btn.textContent = '复制全部内容';
                btn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            }, 1500);
        };
    }

    // ==================== 初始化 ====================

    function init() {
        // 避免重复创建
        if (document.getElementById('zhihu-to-markdown-btn')) {
            return;
        }
        createButton();
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
