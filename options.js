/**
 * Orbit Options Logic
 */
const OrbitSettings = {
    async getSettings() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(['settings'], (result) => {
                resolve(result.settings || { bgUrl: '', theme: 'dark' });
            });
        });
    },

    async saveSettings(settings) {
        return new Promise((resolve) => {
            chrome.storage.sync.set({ settings }, resolve);
        });
    },

    async getAllData() {
        const bookmarks = await new Promise(r => chrome.storage.sync.get(['bookmarks'], res => r(res.bookmarks)));
        const settings = await this.getSettings();
        // Get all icons from local storage
        const allLocal = await new Promise(r => chrome.storage.local.get(null, res => r(res)));

        return { bookmarks, settings, localIcons: allLocal };
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    const bgInput = document.getElementById('bg-url');
    const statusMsg = document.getElementById('status-msg');

    // Load current settings
    const settings = await OrbitSettings.getSettings();
    bgInput.value = settings.bgUrl || '';

    // Save Settings
    document.getElementById('save-settings').onclick = async () => {
        const newSettings = {
            bgUrl: bgInput.value.trim(),
            theme: 'dark'
        };
        await OrbitSettings.saveSettings(newSettings);
        showStatus('Settings saved!');
    };

    // Export Data
    document.getElementById('export-btn').onclick = async () => {
        const data = await OrbitSettings.getAllData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `orbit_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Import Data
    const importInput = document.getElementById('import-input');
    document.getElementById('import-trigger').onclick = () => importInput.click();

    importInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.bookmarks) await chrome.storage.sync.set({ bookmarks: data.bookmarks });
                if (data.settings) await chrome.storage.sync.set({ settings: data.settings });
                if (data.localIcons) await chrome.storage.local.set(data.localIcons);

                showStatus('Data imported! Reloading...', true);
                setTimeout(() => location.reload(), 1500);
            } catch (err) {
                showStatus('Error: Invalid JSON file', true);
            }
        };
        reader.readAsText(file);
    };

    // Reset Data
    document.getElementById('reset-btn').onclick = async () => {
        if (confirm('Are you sure? This will delete all your bookmarks!')) {
            await chrome.storage.sync.clear();
            await chrome.storage.local.clear();
            showStatus('Data reset! Reloading...', true);
            setTimeout(() => location.reload(), 1500);
        }
    };

    function showStatus(msg, isError = false) {
        statusMsg.textContent = msg;
        statusMsg.style.color = isError ? '#ef4444' : '#38bdf8';
        setTimeout(() => statusMsg.textContent = '', 3000);
    }
});
