// ==UserScript==
// @name         知乎收藏夹搜索
// @name:en      Zhihu Collection Search
// @namespace    https://github.com/RustyPiano/zhihu-to-markdown
// @version      1.0.0
// @description  为知乎收藏夹添加本地搜索、查询和跳转功能
// @description:en  Add local search, indexing, and jump features to Zhihu collections
// @author       RustyPiano
// @license      MIT
// @match        https://www.zhihu.com/collection/*
// @icon         https://static.zhihu.com/heifetz/favicon.ico
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        pageSize: 20,
        button: {
            top: '80px',
            right: '20px',
            background: '#3f3f46',
        },
        storagePrefix: 'zhihu-collection-search:',
    };

    const state = {
        items: [],
        loaded: false,
        loading: false,
        total: 0,
        collectionId: '',
        ui: {},
    };

    function init() {
        state.collectionId = getCollectionId();
        if (!state.collectionId || document.getElementById('zhihu-collection-search-btn')) {
            return;
        }

        createButton();
        createPanel();
        loadCache();
    }

    function getCollectionId() {
        const matched = location.pathname.match(/\/collection\/(\d+)/);
        return matched ? matched[1] : '';
    }

    function createButton() {
        const btn = document.createElement('button');
        btn.id = 'zhihu-collection-search-btn';
        btn.textContent = '搜索收藏夹';

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

        btn.addEventListener('mouseenter', () => {
            btn.style.background = '#27272a';
            btn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.18)';
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.background = CONFIG.button.background;
            btn.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.08)';
        });

        btn.addEventListener('click', () => {
            const panel = state.ui.panel;
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            state.ui.input.focus();
        });

        document.body.appendChild(btn);
        state.ui.button = btn;
    }

    function createPanel() {
        const panel = document.createElement('div');
        panel.id = 'zhihu-collection-search-panel';

        Object.assign(panel.style, {
            position: 'fixed',
            top: '126px',
            right: '20px',
            zIndex: '9999',
            width: '420px',
            maxWidth: 'calc(100vw - 40px)',
            maxHeight: 'calc(100vh - 158px)',
            display: 'none',
            background: '#ffffff',
            color: '#18181b',
            border: '1px solid #e4e4e7',
            borderRadius: '8px',
            boxShadow: '0 12px 28px rgba(0, 0, 0, 0.14)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            overflow: 'hidden',
        });

        panel.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #e4e4e7;">
                <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                    <div style="font-size:15px;font-weight:600;white-space:nowrap;">收藏夹搜索</div>
                    <button type="button" data-role="load" style="${buttonStyle(true)}">重新构建收藏夹索引</button>
                </div>
                <button type="button" data-role="close" style="border:none;background:transparent;color:#71717a;cursor:pointer;font-size:18px;line-height:1;padding:2px 4px;">&times;</button>
            </div>
            <div style="padding:12px 14px;border-bottom:1px solid #e4e4e7;">
                <div style="display:flex;gap:8px;">
                    <input data-role="input" type="search" placeholder="输入关键词，支持空格分词" style="flex:1;height:34px;border:1px solid #d4d4d8;border-radius:6px;padding:0 10px;font-size:14px;outline:none;">
                    <button type="button" data-role="search" style="${buttonStyle()}">搜索</button>
                </div>
                <div data-role="status" style="margin-top:8px;font-size:12px;color:#71717a;">未查询。搜索时会自动建立索引。</div>
            </div>
            <div data-role="results" style="max-height:420px;overflow:auto;"></div>
        `;

        document.body.appendChild(panel);

        state.ui.panel = panel;
        state.ui.input = panel.querySelector('[data-role="input"]');
        state.ui.status = panel.querySelector('[data-role="status"]');
        state.ui.results = panel.querySelector('[data-role="results"]');
        state.ui.loadButton = panel.querySelector('[data-role="load"]');
        state.ui.searchButton = panel.querySelector('[data-role="search"]');

        panel.querySelector('[data-role="close"]').addEventListener('click', () => {
            panel.style.display = 'none';
        });
        state.ui.loadButton.addEventListener('click', () => loadCollection(true));
        state.ui.searchButton.addEventListener('click', handleSearch);
        state.ui.input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                handleSearch();
            }
        });
    }

    function buttonStyle(isSecondary = false) {
        if (isSecondary) {
            return 'height:34px;border:1px solid #d4d4d8;border-radius:6px;background:#ffffff;color:#18181b;padding:0 10px;font-size:13px;font-weight:500;cursor:pointer;';
        }
        return 'height:34px;border:1px solid #27272a;border-radius:6px;background:#3f3f46;color:white;padding:0 10px;font-size:13px;font-weight:500;cursor:pointer;';
    }

    async function handleSearch() {
        if (!state.loaded && !state.loading) {
            await loadCollection(false);
        }

        const keyword = state.ui.input.value.trim();
        const results = searchItems(keyword);
        renderResults(results, keyword);
    }

    async function loadCollection(forceRefresh) {
        if (state.loading) return;
        if (state.loaded && !forceRefresh) return;

        state.loading = true;
        setLoading(true);
        setStatus('正在查询收藏夹...');
        showIndexingMessage();

        try {
            const allItems = [];
            const seen = new Set();
            let offset = 0;
            let total = 0;
            let isEnd = false;

            while (!isEnd) {
                const url = `/api/v4/collections/${state.collectionId}/items?offset=${offset}&limit=${CONFIG.pageSize}`;
                const response = await fetch(url, {
                    credentials: 'include',
                    headers: {
                        accept: 'application/json, text/plain, */*',
                    },
                });

                if (!response.ok) {
                    throw new Error(`接口返回 ${response.status}`);
                }

                const data = await response.json();
                const pageItems = Array.isArray(data.data) ? data.data.map(normalizeItem).filter(Boolean) : [];
                total = data.paging?.totals || total || pageItems.length;

                for (const item of pageItems) {
                    const key = item.id || item.url || item.title;
                    if (!seen.has(key)) {
                        seen.add(key);
                        allItems.push(item);
                    }
                }

                offset += pageItems.length || CONFIG.pageSize;
                isEnd = Boolean(data.paging?.is_end) || pageItems.length === 0 || (total > 0 && offset >= total);
                setStatus(`正在查询收藏夹：${Math.min(offset, total || offset)} / ${total || '?'} 条`);
            }

            state.items = allItems;
            state.total = total || allItems.length;
            state.loaded = true;
            saveCache();
            setStatus(`已查询 ${allItems.length} 条收藏。输入关键词后搜索。`);
            renderResults(searchItems(state.ui.input.value.trim()), state.ui.input.value.trim());
        } catch (error) {
            console.error('[知乎收藏夹搜索] 查询失败:', error);
            setStatus(`查询失败：${error.message}。确认已登录且有权限访问该收藏夹。`);
        } finally {
            state.loading = false;
            setLoading(false);
        }
    }

    function normalizeItem(raw) {
        const content = raw?.content || raw;
        if (!content) return null;

        const questionTitle = content.question?.title || '';
        const title = cleanText(content.title || content.name || questionTitle || '无标题');
        const bodyText = cleanText(content.excerpt || content.detail || content.description || content.content || '');
        const excerpt = bodyText.slice(0, 300);
        const author = cleanText(content.author?.name || content.author?.headline || '');
        const type = cleanText(content.type || raw.type || 'content');
        const url = normalizeUrl(content.url || raw.url || content.question?.url || '', content);
        const id = String(content.id || raw.id || url || title);

        return {
            id,
            title,
            excerpt,
            author,
            type,
            url,
            searchText: `${title} ${questionTitle} ${bodyText.slice(0, 2000)} ${author} ${type}`.toLowerCase(),
        };
    }

    function normalizeUrl(url, content) {
        if (content?.type === 'answer' && content.question?.id && content.id) {
            return `https://www.zhihu.com/question/${content.question.id}/answer/${content.id}`;
        }
        if (content?.type === 'article' && content.id) {
            return `https://zhuanlan.zhihu.com/p/${content.id}`;
        }
        if (!url) return location.href;
        if (url.startsWith('//')) return `https:${url}`;
        if (url.startsWith('/')) return `${location.origin}${url}`;
        return url;
    }

    function cleanText(text) {
        const div = document.createElement('div');
        div.innerHTML = String(text || '');
        return div.textContent.replace(/\s+/g, ' ').trim();
    }

    function searchItems(keyword) {
        if (!keyword) return state.items;
        const terms = keyword.toLowerCase().split(/\s+/).filter(Boolean);
        return state.items.filter(item => terms.every(term => item.searchText.includes(term)));
    }

    function renderResults(results, keyword) {
        const container = state.ui.results;
        container.innerHTML = '';

        if (!state.loaded) {
            container.appendChild(emptyNode('还没有查询收藏夹。'));
            return;
        }

        if (!results.length) {
            container.appendChild(emptyNode(keyword ? '没有匹配结果。' : '收藏夹为空。'));
            setStatus(`已查询 ${state.items.length} 条，匹配 0 条。`);
            return;
        }

        setStatus(`已查询 ${state.items.length} 条，匹配 ${results.length} 条。`);

        const frag = document.createDocumentFragment();
        results.forEach((item, index) => {
            frag.appendChild(resultNode(item, index));
        });
        container.appendChild(frag);
    }

    function showIndexingMessage() {
        state.ui.results.innerHTML = '';
        const node = document.createElement('div');
        node.textContent = '正在构建索引，请稍后...';
        Object.assign(node.style, {
            padding: '32px 14px',
            color: '#18181b',
            fontSize: '14px',
            fontWeight: '500',
            textAlign: 'center',
        });
        state.ui.results.appendChild(node);
    }

    function resultNode(item, index) {
        const row = document.createElement('div');
        Object.assign(row.style, {
            padding: '12px 14px',
            borderBottom: '1px solid #f4f4f5',
        });

        const title = document.createElement('a');
        title.href = item.url;
        title.target = '_blank';
        title.rel = 'noopener noreferrer';
        title.textContent = `${index + 1}. ${item.title}`;
        Object.assign(title.style, {
            display: 'block',
            color: '#18181b',
            fontSize: '14px',
            fontWeight: '600',
            lineHeight: '1.45',
            textDecoration: 'none',
        });

        const meta = document.createElement('div');
        meta.textContent = [item.type, item.author].filter(Boolean).join(' · ');
        Object.assign(meta.style, {
            marginTop: '4px',
            color: '#71717a',
            fontSize: '12px',
        });

        const excerpt = document.createElement('div');
        excerpt.textContent = item.excerpt.length > 140 ? `${item.excerpt.slice(0, 140)}...` : item.excerpt;
        Object.assign(excerpt.style, {
            marginTop: '6px',
            color: '#3f3f46',
            fontSize: '13px',
            lineHeight: '1.5',
        });

        const jump = document.createElement('button');
        jump.type = 'button';
        jump.textContent = '跳转';
        Object.assign(jump.style, {
            marginTop: '8px',
            height: '28px',
            border: '1px solid #d4d4d8',
            borderRadius: '6px',
            background: '#ffffff',
            color: '#18181b',
            padding: '0 10px',
            fontSize: '12px',
            cursor: 'pointer',
        });
        jump.addEventListener('click', () => window.open(item.url, '_blank', 'noopener,noreferrer'));

        row.appendChild(title);
        if (meta.textContent) row.appendChild(meta);
        if (excerpt.textContent) row.appendChild(excerpt);
        row.appendChild(jump);
        return row;
    }

    function emptyNode(text) {
        const node = document.createElement('div');
        node.textContent = text;
        Object.assign(node.style, {
            padding: '28px 14px',
            color: '#71717a',
            fontSize: '13px',
            textAlign: 'center',
        });
        return node;
    }

    function setStatus(text) {
        state.ui.status.textContent = text;
    }

    function setLoading(isLoading) {
        state.ui.loadButton.disabled = isLoading;
        state.ui.searchButton.disabled = isLoading;
        state.ui.loadButton.style.opacity = isLoading ? '0.65' : '1';
        state.ui.searchButton.style.opacity = isLoading ? '0.65' : '1';
        state.ui.loadButton.style.cursor = isLoading ? 'not-allowed' : 'pointer';
        state.ui.searchButton.style.cursor = isLoading ? 'not-allowed' : 'pointer';
    }

    function cacheKey() {
        return `${CONFIG.storagePrefix}${state.collectionId}`;
    }

    function loadCache() {
        try {
            const cache = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
            if (!cache || !Array.isArray(cache.items)) return;
            state.items = cache.items;
            state.total = cache.total || cache.items.length;
            state.loaded = true;
            setStatus(`已载入缓存 ${state.items.length} 条。可直接搜索，或重新查询收藏夹。`);
        } catch (error) {
            console.warn('[知乎收藏夹搜索] 缓存读取失败:', error);
        }
    }

    function saveCache() {
        try {
            localStorage.setItem(cacheKey(), JSON.stringify({
                total: state.total,
                savedAt: Date.now(),
                items: state.items,
            }));
        } catch (error) {
            console.warn('[知乎收藏夹搜索] 缓存写入失败:', error);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
