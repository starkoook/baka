// Bridge: full pywebview.api for lora-rescripts launcher in Electron
const { contextBridge } = require('electron')

const api = {
  // ── Settings ──
  get_settings() {
    return {
      language: 'zh',
      theme: 'dark',
      proxy_enabled: false,
      proxy_address: '',
      window_width: 960,
      window_height: 680,
    }
  },
  set_settings(v) { return { success: true } },
  get_language() { return 'zh' },
  set_language(lang) { return { success: true } },
  get_translations() { return {} },
  get_app_version() { return '1.6.12' },
  get_project_version() { return { version: '1.6.12' } },

  // ── Runtime ──
  get_runtimes() {
    return {
      runtimes: {},
      selected_runtime_id: null,
      best_runtime_id: null,
      installable: false,
    }
  },
  get_runtime_defs() { return [] },
  get_best_runtime() { return null },
  select_runtime(id) {
    return { success: true, runtime_id: id }
  },
  install_runtime(id) { return { success: false, error: 'Not supported in Baka TOOLS' } },
  initialize_runtime(id) { return { success: false } },
  uninstall_runtime(id) { return { success: false } },
  get_dependency_cache_states() { return {} },
  prefetch_runtime_dependencies(id) { return { success: false } },
  clear_runtime_dependency_cache(id) { return { success: false } },

  // ── GPU ──
  get_gpu_stats() {
    return { gpus: [], platform: 'win32' }
  },

  // ── Launch ──
  launch(runtime_id) {
    // This should actually launch gui.py via Electron IPC
    return { success: false, error: 'Use Baka TOOLS launch button' }
  },
  stop() { return { success: true } },
  kill() { return { success: true } },
  is_running() { return false },
  is_installing() { return false },

  // ── Diagnostics ──
  get_health_report(id) { return { status: 'ok', checks: [] } },
  get_launch_preflight(id, settings) { return { ok: true, warnings: [], errors: [] } },
  get_runtime_recommendation() { return null },
  get_runtime_compatibility() { return [] },

  // ── Plugins ──
  scan_plugins() { return [] },
  set_plugin_enabled(id, enabled) { return { success: true } },
  get_ui_profiles() {
    return { profiles: [], active: 'default' }
  },
  activate_ui_profile(id) { return { success: true } },
  install_ui_profile(url, replace) { return { success: false, error: 'Not supported' } },
  uninstall_ui_profile(id) { return { success: false } },

  // ── Managed catalog ──
  get_managed_catalog(force) { return { presets: [] } },
  test_managed_connection() { return { success: false } },
  get_managed_import_state() { return {} },
  import_managed_preset(id) { return { success: false } },
  revert_managed_import() { return { success: true } },

  // ── Task ──
  get_task_state() { return { task: null, status: 'idle' } },
  get_task_history() { return [] },
  clear_task_history() { return { success: true } },

  // ── Updates ──
  check_for_updates(force, channel) { return { update_available: false } },
  run_updater() { return { success: false } },

  // ── Plans ──
  get_launch_plan(id, settings) { return null },
  get_install_plan(id) { return null },

  // ── Misc ──
  open_path(p) { return { success: true } },
  flush_frontend_settings_on_close() { return { success: true } },
}

// All methods return promises (PyWebView auto-wraps in Promises)
const wrapped = {}
for (const [key, fn] of Object.entries(api)) {
  wrapped[key] = (...args) => {
    try {
      const result = fn(...args)
      return Promise.resolve(result)
    } catch (e) {
      return Promise.reject(e)
    }
  }
}

contextBridge.exposeInMainWorld('pywebview', { api: wrapped })
