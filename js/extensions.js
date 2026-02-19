/**
 * extensions.js — Plugin System & Extension Hooks
 * Provides APIs for future extensibility: ads, auth, tracking, custom toolbar buttons.
 */
export class ExtensionManager {
    constructor(app) {
        this.app = app;
        this.plugins = new Map();
        this.hooks = {
            'beforeRender': [],
            'afterRender': [],
            'beforeSave': [],
            'afterSave': [],
            'onFileOpen': [],
            'onFileClose': [],
            'onInit': [],
            'onDestroy': [],
            'onThemeChange': [],
            'onEditorChange': [],
        };
        this.toolbarButtons = [];
        this.statusBarItems = [];
        this.sidebarPanels = [];

        // Ad slots
        this.adSlots = {
            header: document.getElementById('ext-slot-header'),
            sidebar: document.getElementById('ext-slot-sidebar'),
            footer: document.getElementById('ext-slot-footer'),
        };
    }

    /**
     * Register a plugin
     * @param {Object} plugin - Plugin descriptor
     * @param {string} plugin.id - Unique plugin ID
     * @param {string} plugin.name - Display name
     * @param {string} plugin.version - Version string
     * @param {Function} plugin.init - Initialization function (receives app instance)
     * @param {Function} [plugin.destroy] - Cleanup function
     * @param {Object} [plugin.hooks] - Hook functions { hookName: handler }
     */
    register(plugin) {
        if (!plugin.id) {
            console.error('Plugin must have an id');
            return;
        }

        if (this.plugins.has(plugin.id)) {
            console.warn(`Plugin "${plugin.id}" already registered`);
            return;
        }

        this.plugins.set(plugin.id, plugin);

        // Register hooks
        if (plugin.hooks) {
            for (const [hookName, handler] of Object.entries(plugin.hooks)) {
                if (this.hooks[hookName]) {
                    this.hooks[hookName].push({ pluginId: plugin.id, handler });
                }
            }
        }

        // Initialize
        if (plugin.init) {
            try {
                plugin.init(this.app);
            } catch (e) {
                console.error(`Plugin "${plugin.id}" init error:`, e);
            }
        }

        console.log(`Plugin registered: ${plugin.name} v${plugin.version}`);
    }

    /**
     * Unregister a plugin
     */
    unregister(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) return;

        // Run destroy
        if (plugin.destroy) {
            try {
                plugin.destroy(this.app);
            } catch (e) {
                console.error(`Plugin "${pluginId}" destroy error:`, e);
            }
        }

        // Remove hooks
        for (const hookList of Object.values(this.hooks)) {
            for (let i = hookList.length - 1; i >= 0; i--) {
                if (hookList[i].pluginId === pluginId) {
                    hookList.splice(i, 1);
                }
            }
        }

        // Remove toolbar buttons
        this.toolbarButtons = this.toolbarButtons.filter(b => b.pluginId !== pluginId);
        this.statusBarItems = this.statusBarItems.filter(b => b.pluginId !== pluginId);

        this.plugins.delete(pluginId);
    }

    /**
     * Run a hook
     */
    async runHook(hookName, data = {}) {
        const handlers = this.hooks[hookName] || [];
        let result = data;

        for (const { handler } of handlers) {
            try {
                const output = await handler(result, this.app);
                if (output !== undefined) result = output;
            } catch (e) {
                console.error(`Hook "${hookName}" error:`, e);
            }
        }

        return result;
    }

    /**
     * Add a custom toolbar button (for plugins)
     */
    addToolbarButton(pluginId, config) {
        this.toolbarButtons.push({ pluginId, ...config });
        this.app.eventBus.emit('toolbar:update');
    }

    /**
     * Add a status bar item (for plugins)
     */
    addStatusBarItem(pluginId, config) {
        this.statusBarItems.push({ pluginId, ...config });
        this.app.eventBus.emit('statusbar:update');
    }

    /**
     * Enable an ad slot
     */
    enableAdSlot(slotName, htmlContent) {
        const slot = this.adSlots[slotName];
        if (slot) {
            slot.innerHTML = htmlContent;
            slot.classList.add('active');
        }
    }

    /**
     * Authentication hook placeholder
     */
    setAuthProvider(provider) {
        this._authProvider = provider;
        this.app.eventBus.emit('auth:provider-set', provider);
    }

    getAuthProvider() {
        return this._authProvider || null;
    }

    /**
     * Analytics/tracking hook placeholder
     */
    setTracker(tracker) {
        this._tracker = tracker;
    }

    track(event, data = {}) {
        if (this._tracker) {
            this._tracker(event, data);
        }
    }

    /**
     * Get list of registered plugins
     */
    getPlugins() {
        return Array.from(this.plugins.values()).map(p => ({
            id: p.id,
            name: p.name,
            version: p.version
        }));
    }

    destroy() {
        for (const [id] of this.plugins) {
            this.unregister(id);
        }
    }
}
