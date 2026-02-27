/**
 * Orbit Storage Wrapper
 */
const OrbitStorage = {
    DEFAULT_BOOKMARKS: [
        { id: '1', title: 'GitHub', url: 'https://github.com', position: 0 },
        { id: '2', title: 'YouTube', url: 'https://youtube.com', position: 1 },
        { id: '3', title: 'Tailwind CSS', url: 'https://tailwindcss.com', position: 2 }
    ],

    async getBookmarks() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(['bookmarks'], (result) => {
                const bms = result.bookmarks || this.DEFAULT_BOOKMARKS;
                bms.forEach((b, i) => { if (b.position === undefined) b.position = i; });
                resolve(bms);
            });
        });
    },

    async saveBookmarks(bookmarks) {
        return new Promise((resolve) => {
            chrome.storage.sync.set({ bookmarks }, resolve);
        });
    },

    async getSettings() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(['settings'], (result) => {
                resolve(result.settings || { bgUrl: '', theme: 'dark' });
            });
        });
    },

    async getCachedIcon(id) {
        return new Promise((resolve) => {
            chrome.storage.local.get([`icon_${id}`], (result) => {
                resolve(result[`icon_${id}`] || null);
            });
        });
    },

    async cacheIcon(id, base64) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ [`icon_${id}`]: base64 }, resolve);
        });
    }
};

/**
 * Orbit Icon Service
 */
const IconService = {
    async getIcon(bookmark) {
        const cached = await OrbitStorage.getCachedIcon(bookmark.id);
        if (cached) return cached;

        let domain = '';
        try { domain = new URL(bookmark.url).hostname; } catch (e) { return this.generateLetterAvatar(bookmark.title); }
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    },

    generateLetterAvatar(title) {
        const firstChar = (title || '?').charAt(0).toUpperCase();
        const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#00bcd4', '#009688', '#4caf50', '#ffc107', '#ff9800'];
        const color = colors[title.length % colors.length];

        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = color; ctx.fillRect(0, 0, 128, 128);
        ctx.fillStyle = 'white'; ctx.font = 'bold 80px Inter, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(firstChar, 64, 64);
        return canvas.toDataURL();
    }
};

const OrbitUI = {
    currentCustomIcon: null,
    useAutoIcon: true,
    sortable: null,

    async applySettings() {
        const settings = await OrbitStorage.getSettings();
        if (settings.bgUrl) {
            document.body.style.backgroundImage = `url('${settings.bgUrl}')`;
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center';
            document.body.style.backgroundAttachment = 'fixed';
        }
    },

    async renderGrid() {
        const grid = document.getElementById('bookmark-grid');
        const addBtn = document.getElementById('add-btn');
        if (!grid || !addBtn) return;

        const bookmarks = await OrbitStorage.getBookmarks();
        bookmarks.sort((a, b) => a.position - b.position);

        grid.querySelectorAll('.bookmark-item').forEach(el => el.remove());

        for (const b of bookmarks) {
            const card = await this.createCard(b);
            grid.insertBefore(card, addBtn);
        }

        this.initSortable();
    },

    initSortable() {
        const grid = document.getElementById('bookmark-grid');
        if (this.sortable) this.sortable.destroy();
        if (typeof Sortable === 'undefined') return;

        this.sortable = new Sortable(grid, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            filter: '#add-btn, .settings-link',
            preventOnFilter: false,
            onEnd: async () => {
                const items = Array.from(grid.querySelectorAll('.bookmark-item'));
                const bookmarks = await OrbitStorage.getBookmarks();

                const updatedBookmarks = items.map((el, index) => {
                    const id = el.querySelector('.delete-btn').getAttribute('data-id');
                    const b = bookmarks.find(bm => bm.id === id);
                    if (b) return { ...b, position: index };
                    return null;
                }).filter(Boolean);

                await OrbitStorage.saveBookmarks(updatedBookmarks);
            }
        });
    },

    async createCard(bookmark) {
        const iconUrl = await IconService.getIcon(bookmark);
        const card = document.createElement('div');
        card.className = 'bookmark-item icon-card group';
        card.innerHTML = `
            <div class="icon-img-wrapper">
                <img src="${iconUrl}" alt="${bookmark.title}">
            </div>
            <span class="bookmark-title">${bookmark.title}</span>
            <button class="delete-btn" data-id="${bookmark.id}">×</button>
        `;

        const img = card.querySelector('img');
        img.addEventListener('error', () => {
            let domain = '';
            try { domain = new URL(bookmark.url).hostname; } catch (e) { }
            if (domain && !img.src.includes('duckduckgo')) {
                img.src = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
            } else {
                img.style.display = 'none';
                const wrapper = card.querySelector('.icon-img-wrapper');
                wrapper.innerHTML = `<div class="fallback-avatar" style="background:${this.getDeterministicColor(bookmark.title)}">${bookmark.title.charAt(0)}</div>`;
            }
        });

        card.querySelector('.icon-img-wrapper').addEventListener('click', () => window.location.assign(bookmark.url));
        card.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteBookmark(bookmark.id);
        });

        return card;
    },

    getDeterministicColor(str) {
        const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#00bcd4', '#009688', '#4caf50', '#ffc107', '#ff9800'];
        return colors[str.length % colors.length];
    },

    handleIconUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            this.currentCustomIcon = event.target.result;
            const preview = document.getElementById('icon-preview');
            const plus = document.getElementById('upload-plus');
            preview.src = this.currentCustomIcon;
            preview.classList.remove('hidden');
            plus.classList.add('hidden');
            this.setUseAutoIcon(false);
        };
        reader.readAsDataURL(file);
    },

    setUseAutoIcon(auto) {
        this.useAutoIcon = auto;
        document.getElementById('btn-auto-icon').classList.toggle('active', auto);
        document.getElementById('icon-upload-btn').classList.toggle('active', !auto);
        if (auto) {
            this.currentCustomIcon = null;
            document.getElementById('icon-preview').classList.add('hidden');
            document.getElementById('upload-plus').classList.remove('hidden');
        }
    },

    async addBookmark() {
        const titleEl = document.getElementById('bm-title');
        const urlEl = document.getElementById('bm-url');
        const title = titleEl.value.trim();
        let url = urlEl.value.trim();

        if (!title || !url) return;
        if (!url.startsWith('http')) url = 'https://' + url;

        const id = Date.now().toString();
        const bookmarks = await OrbitStorage.getBookmarks();
        bookmarks.push({ id, title, url, position: bookmarks.length });
        await OrbitStorage.saveBookmarks(bookmarks);

        if (!this.useAutoIcon && this.currentCustomIcon) {
            await OrbitStorage.cacheIcon(id, this.currentCustomIcon);
        }

        this.renderGrid();
        this.toggleModal();
    },

    async deleteBookmark(id) {
        let bookmarks = await OrbitStorage.getBookmarks();
        bookmarks = bookmarks.filter(b => b.id !== id);
        await OrbitStorage.saveBookmarks(bookmarks);
        chrome.storage.local.remove([`icon_${id}`]);
        this.renderGrid();
    },

    toggleModal() {
        const modal = document.getElementById('modal');
        modal.classList.toggle('active');
        if (modal.classList.contains('active')) this.resetModal();
    },

    resetModal() {
        this.currentCustomIcon = null;
        this.useAutoIcon = true;
        document.getElementById('bm-title').value = '';
        document.getElementById('bm-url').value = '';
        document.getElementById('icon-preview').classList.add('hidden');
        document.getElementById('upload-plus').classList.remove('hidden');
        document.getElementById('btn-auto-icon').classList.add('active');
        document.getElementById('icon-upload-btn').classList.remove('active');

        const urlInput = document.getElementById('bm-url');
        const preview = document.getElementById('auto-icon-preview');
        const updatePreview = () => {
            const val = urlInput.value.trim();
            if (val.length > 3) {
                let domain = val;
                try { domain = new URL(val.startsWith('http') ? val : 'https://' + val).hostname; } catch (e) { }
                preview.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
            }
        };
        urlInput.removeEventListener('input', updatePreview);
        urlInput.addEventListener('input', updatePreview);
    },

    updateClock() {
        const clock = document.getElementById('clock');
        if (!clock) return;
        const now = new Date();
        clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    OrbitUI.applySettings();
    OrbitUI.renderGrid();
    OrbitUI.updateClock();
    setInterval(() => OrbitUI.updateClock(), 1000);

    document.getElementById('add-btn').addEventListener('click', () => OrbitUI.toggleModal());
    document.getElementById('close-modal').addEventListener('click', () => OrbitUI.toggleModal());
    document.getElementById('save-bm').addEventListener('click', () => OrbitUI.addBookmark());

    document.getElementById('btn-auto-icon').addEventListener('click', () => OrbitUI.setUseAutoIcon(true));
    document.getElementById('icon-upload-btn').addEventListener('click', () => {
        if (!OrbitUI.currentCustomIcon) document.getElementById('icon-input').click();
        else OrbitUI.setUseAutoIcon(false);
    });
    document.getElementById('icon-input').addEventListener('change', (e) => OrbitUI.handleIconUpload(e));

    const search = document.getElementById('search-input');
    if (search) {
        search.focus();
        search.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && search.value.trim()) {
                window.location.href = `https://www.google.com/search?q=${encodeURIComponent(search.value.trim())}`;
            }
        });
    }
});
