<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useBooruGalleryStore } from '@/stores/booru-gallery'

const store = useBooruGalleryStore()

const showAddSite = ref(false)
const showSettings = ref(false)
const showFilters = ref(false)
const newSiteName = ref('')
const newSiteUrl = ref('')
const savingSite = ref(false)
const showSuggestions = ref(false)
let suggestTimer: number | undefined
const batchMode = ref(false)
const selectedIds = ref<Set<string>>(new Set())
const showBatchDialog = ref(false)
const downloadFolder = ref('')
const newFolderName = ref('')
const batchBusy = ref(false)
const batchProgress = ref({ done: 0, total: 0, current: '' })

const detailVisible = computed(() => Boolean(store.selectedPost))

onMounted(async () => {
  await Promise.all([store.loadSites(), store.loadSettings()])
  store.loadLocalData()
  await store.search(true)
  window.booruGalleryAPI.onBatchProgress((data) => {
    batchProgress.value = data
  })
})

function detectType(url: string) {
  const host = url.replace(/^https?:\/\//, '').split('/')[0].toLowerCase()
  if (host.includes('danbooru')) return 'danbooru'
  if (host.includes('e621') || host.includes('e926')) return 'e621'
  if (host.includes('derpibooru')) return 'derpibooru'
  if (host.includes('konachan') || host.includes('yande.re')) return 'moebooru'
  return 'gelbooru'
}

async function addSite() {
  if (!newSiteName.value.trim() || !newSiteUrl.value.trim()) return
  savingSite.value = true
  const id = `custom-${Date.now()}`
  await window.booruGalleryAPI.saveSite({
    id,
    label: newSiteName.value.trim(),
    baseUrl: newSiteUrl.value.trim().replace(/\/$/, ''),
    type: detectType(newSiteUrl.value),
  })
  await store.loadSites()
  store.activeSiteId = id
  newSiteName.value = ''
  newSiteUrl.value = ''
  showAddSite.value = false
  savingSite.value = false
  await store.search(true)
}

async function selectSite(siteId: string) {
  store.activeSiteId = siteId
  await runSearch()
}

function openPost(post: BooruGalleryPost) {
  void store.openPost(post)
}

async function copyPrompt() {
  const text = store.promptText
  if (!text) return
  await navigator.clipboard.writeText(text)
}

async function copyAuthor() {
  const author = store.selectedPost?.author
  if (!author) return
  await navigator.clipboard.writeText(author)
}

async function downloadPost() {
  const post = store.selectedPost
  if (!post) return
  const result = await window.booruGalleryAPI.download({
    url: post.fileUrl || post.sampleUrl || post.previewUrl,
    suggestedName: `${post.id}.jpg`,
  })
  if (!result.success) store.error = result.error || '下载失败'
}

function onQueryInput() {
  showSuggestions.value = true
  window.clearTimeout(suggestTimer)
  suggestTimer = window.setTimeout(() => {
    void store.fetchSuggestions(store.query)
  }, 250)
}

function pickSuggestion(tag: string) {
  store.addTagToQuery(tag)
  showSuggestions.value = false
  void runSearch()
}

function pickRelated(tag: string) {
  store.addTagToQuery(tag)
  void runSearch()
}

async function runSearch() {
  if (store.query.trim()) store.addHistory(store.query)
  await store.search(true)
  if (store.rankingPeriod === 'none') {
    void store.fetchRelatedTags(store.query)
  } else {
    store.relatedTags = []
  }
}

function randomDraw() {
  const pool = store.posts
  if (!pool.length) {
    void runSearch()
    return
  }
  const post = pool[Math.floor(Math.random() * pool.length)]
  if (post) openPost(post)
}

function applyHistory(queryText: string) {
  store.query = queryText
  showSuggestions.value = false
  void runSearch()
}

function showFavorites() {
  store.posts = store.favorites
  store.ended = true
}

function onGridScroll(event: Event) {
  const el = event.currentTarget as HTMLElement
  if (!el || store.loading || store.ended) return
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 320) {
    void store.loadMore()
  }
}

function toggleBatchMode() {
  batchMode.value = !batchMode.value
  if (!batchMode.value) selectedIds.value.clear()
  else selectedIds.value.clear()
}

function toggleSelect(post: BooruGalleryPost) {
  if (!batchMode.value) return
  const next = new Set(selectedIds.value)
  if (next.has(post.id)) next.delete(post.id)
  else next.add(post.id)
  selectedIds.value = next
}

function onCardClick(post: BooruGalleryPost) {
  if (batchMode.value) toggleSelect(post)
  else openPost(post)
}

async function chooseFolder() {
  const result = await window.booruGalleryAPI.chooseFolder()
  if (result.success && result.folderPath) downloadFolder.value = result.folderPath
}

async function createAndUseFolder() {
  if (!downloadFolder.value || !newFolderName.value.trim()) return
  const result = await window.booruGalleryAPI.createFolder(downloadFolder.value, newFolderName.value)
  if (result.success && result.folderPath) downloadFolder.value = result.folderPath
  newFolderName.value = ''
}

async function startBatchDownload() {
  const posts = store.posts.filter((post) => selectedIds.value.has(post.id))
  if (!posts.length || !downloadFolder.value) return
  batchBusy.value = true
  const result = await window.booruGalleryAPI.batchDownload({
    folder: downloadFolder.value,
    items: posts.map((post) => ({
      url: post.fileUrl || post.sampleUrl || post.previewUrl,
      filename: `${post.id}.jpg`,
    })),
  })
  batchBusy.value = false
  if (result.success) {
    store.error = `下载完成：${result.downloaded} 张`
    selectedIds.value.clear()
    batchMode.value = false
    showBatchDialog.value = false
  } else {
    store.error = result.error || '批量下载失败'
  }
}
</script>

<template>
  <main class="booru-page">
    <header class="booru-header">
      <div class="booru-title">
        <span class="booru-eyebrow">BOORU COLLECTION</span>
        <h1>素材画廊</h1>
      </div>
    </header>

    <div v-if="showSettings" class="booru-modal">
      <div class="booru-modal__card booru-settings">
        <header class="booru-modal__head">
          <h2>在线画廊设置</h2>
          <button class="booru-modal__close" type="button" aria-label="关闭" @click="showSettings = false">×</button>
        </header>
        <div class="booru-settings__section">
          <h3>网络</h3>
          <label class="booru-field">
            <span>代理地址</span>
            <input v-model="store.settings.proxy" class="booru-input" placeholder="例如 http://127.0.0.1:7890" />
          </label>
          <label class="booru-field">
            <span>超时（秒）</span>
            <input v-model.number="store.settings.timeout" class="booru-input" type="number" min="3" max="120" />
          </label>
        </div>
        <div class="booru-settings__section">
          <h3>站点 API 配置</h3>
          <p class="booru-settings__hint">匿名浏览一般不需要填写；遇到限速或想提升额度时再填。</p>
          <div class="booru-settings__credentials">
            <div class="booru-site-cred">
              <strong>Danbooru</strong>
              <label class="booru-field"><span>用户名</span><input v-model="store.settings.credentials.danbooru.username" class="booru-input" placeholder="用户名" /></label>
              <label class="booru-field"><span>API Key</span><input v-model="store.settings.credentials.danbooru.apiKey" class="booru-input" placeholder="API Key" /></label>
            </div>
            <div class="booru-site-cred">
              <strong>Gelbooru</strong>
              <label class="booru-field"><span>User ID</span><input v-model="store.settings.credentials.gelbooru.userId" class="booru-input" placeholder="User ID" /></label>
              <label class="booru-field"><span>API Key</span><input v-model="store.settings.credentials.gelbooru.apiKey" class="booru-input" placeholder="API Key" /></label>
            </div>
            <div class="booru-site-cred">
              <strong>e621</strong>
              <label class="booru-field"><span>用户名</span><input v-model="store.settings.credentials.e621.username" class="booru-input" placeholder="用户名" /></label>
              <label class="booru-field"><span>API Key</span><input v-model="store.settings.credentials.e621.apiKey" class="booru-input" placeholder="API Key" /></label>
            </div>
            <div class="booru-site-cred">
              <strong>Derpibooru</strong>
              <label class="booru-field"><span>API Key</span><input v-model="store.settings.credentials.derpibooru.apiKey" class="booru-input" placeholder="API Key" /></label>
            </div>
          </div>
        </div>
        <footer class="booru-modal__footer">
          <button class="booru-button" type="button" @click="showSettings = false">取消</button>
          <button class="booru-button booru-button--primary" type="button" @click="store.saveSettings">保存设置</button>
        </footer>
      </div>
    </div>

    <div v-if="showAddSite" class="booru-modal">
      <div class="booru-modal__card">
        <header class="booru-modal__head">
          <h2>添加图站</h2>
          <button class="booru-modal__close" type="button" aria-label="关闭" @click="showAddSite = false">×</button>
        </header>
        <div class="booru-settings__section">
          <label class="booru-field">
            <span>网站名称</span>
            <input v-model="newSiteName" class="booru-input" placeholder="例如 Konachan" />
          </label>
          <label class="booru-field">
            <span>网址</span>
            <input v-model="newSiteUrl" class="booru-input" placeholder="例如 https://konachan.com" />
          </label>
        </div>
        <footer class="booru-modal__footer">
          <button class="booru-button" type="button" @click="showAddSite = false">取消</button>
          <button class="booru-button booru-button--primary" type="button" :disabled="savingSite" @click="addSite">保存</button>
        </footer>
      </div>
    </div>

    <section class="booru-toolbar">
      <select v-model="store.activeSiteId" class="booru-select" @change="selectSite(store.activeSiteId)">
        <option v-for="site in store.sites" :key="site.id" :value="site.id">{{ site.label }}</option>
      </select>
      <div class="booru-search-wrap">
        <input
          v-model="store.query"
          class="booru-input booru-search"
          placeholder="标签搜索，例如 1girl blue_eyes -blurry"
          @input="onQueryInput"
          @keyup.enter="runSearch"
          @focus="showSuggestions = true"
        />
        <button class="booru-search-submit" type="button" @click="runSearch">搜索</button>
        <div v-if="showSuggestions && store.query.trim() === '' && store.searchHistory.length" class="booru-suggestions">
          <button v-for="item in store.searchHistory" :key="item" class="booru-suggestion" type="button" @mousedown.prevent="applyHistory(item)">
            <b>{{ item }}</b><i>历史</i>
          </button>
        </div>
        <div v-else-if="showSuggestions && store.suggestions.length" class="booru-suggestions">
          <button v-for="tag in store.suggestions" :key="tag.name" class="booru-suggestion" type="button" @mousedown.prevent="pickSuggestion(tag.name)">
            <b>{{ tag.name }}</b><i>{{ tag.category }} · {{ tag.count }}</i>
          </button>
        </div>
      </div>
      <select v-model="store.rating" class="booru-select">
        <option value="all">全部分级</option>
        <option value="general">一般</option>
        <option value="sensitive">敏感</option>
        <option value="questionable">可疑</option>
        <option value="explicit">成人</option>
      </select>
      <select v-model="store.sort" class="booru-select">
        <option value="latest">最新</option>
        <option value="score">分数</option>
      </select>
      <select v-model="store.rankingPeriod" class="booru-select" @change="runSearch">
        <option value="none">搜索模式</option>
        <option value="day">日榜</option>
        <option value="week">周榜</option>
        <option value="month">月榜</option>
      </select>
      <button class="booru-button" type="button" :class="{ 'booru-button--active': batchMode }" @click="toggleBatchMode">多选</button>
      <button class="booru-button" type="button" :disabled="selectedIds.size === 0" @click="showBatchDialog = true">批量下载</button>
      <button class="booru-button" type="button" @click="showFavorites">收藏</button>
      <button class="booru-button" type="button" @click="randomDraw">随机</button>
      <span class="booru-toolbar__spacer"></span>
      <button class="booru-toolbar-action" type="button" :class="{ active: showSettings }" title="设置" @click="showSettings = !showSettings">设置</button>
      <button class="booru-toolbar-action" type="button" :class="{ active: showAddSite }" title="添加图站" @click="showAddSite = !showAddSite">+ 图站</button>
    </section>

    <div v-if="store.error" class="booru-error">
      <span>{{ store.error }}</span>
      <button class="booru-error__retry" type="button" @click="runSearch">重试</button>
    </div>

    <section v-if="store.rankingPeriod === 'none' && store.relatedTags.length" class="booru-related">
      <span class="booru-related__label">相关标签</span>
      <button
        v-for="tag in store.relatedTags.slice(0, 30)"
        :key="tag.name"
        class="booru-related__tag"
        type="button"
        @click="pickRelated(tag.name)"
      >
        {{ tag.name }} <i>{{ tag.count }}</i>
      </button>
    </section>

    <section class="booru-grid" @scroll="onGridScroll">
      <button
        v-for="post in store.posts"
        :key="post.id"
        class="booru-card"
        type="button"
        :class="{ 'booru-card--selected': selectedIds.has(post.id) }"
        @click="onCardClick(post)"
      >
        <img :src="post.previewUrl || post.sampleUrl" :alt="post.id" loading="lazy" />
        <span v-if="batchMode" class="booru-card__check" :class="{ 'booru-card__check--active': selectedIds.has(post.id) }">
          {{ selectedIds.has(post.id) ? '✓' : '' }}
        </span>
        <span class="booru-card__overlay" aria-hidden="true"></span>
        <span class="booru-card__meta">
          <b>{{ post.width }}×{{ post.height }}</b>
          <i>{{ post.rating }}</i>
        </span>
      </button>
    </section>

    <div class="booru-more">
      <p v-if="store.loading">加载中…</p>
      <p v-else-if="store.ended">没有更多了</p>
    </div>

    <div v-if="showBatchDialog" class="booru-modal">
      <div class="booru-modal__card">
        <header class="booru-modal__head">
          <h2>批量下载 {{ selectedIds.size }} 张图片</h2>
          <button class="booru-modal__close" type="button" aria-label="关闭" @click="showBatchDialog = false">×</button>
        </header>
        <div class="booru-settings__section">
          <label class="booru-field">
            <span>下载到</span>
            <div class="booru-folder-row">
              <input v-model="downloadFolder" class="booru-input" readonly placeholder="请选择文件夹" />
              <button class="booru-button" type="button" @click="chooseFolder">选择文件夹</button>
            </div>
          </label>
          <label class="booru-field">
            <span>新建子文件夹（可选）</span>
            <div class="booru-folder-row">
              <input v-model="newFolderName" class="booru-input" placeholder="输入文件夹名称" />
              <button class="booru-button" type="button" :disabled="!newFolderName.trim()" @click="createAndUseFolder">创建并使用</button>
            </div>
          </label>
          <p v-if="batchBusy" class="booru-progress">{{ batchProgress.done }} / {{ batchProgress.total }} · {{ batchProgress.current }}</p>
        </div>
        <footer class="booru-modal__footer">
          <button class="booru-button" type="button" @click="showBatchDialog = false">取消</button>
          <button class="booru-button booru-button--primary" type="button" :disabled="batchBusy || !downloadFolder || selectedIds.size === 0" @click="startBatchDownload">开始下载</button>
        </footer>
      </div>
    </div>

    <div v-if="detailVisible" class="booru-detail">
      <div class="booru-detail__panel">
        <button class="booru-detail__close" type="button" aria-label="关闭" @click="store.closePost">×</button>
        <div class="booru-detail__image">
          <img v-if="store.selectedImage" :src="store.selectedImage" alt="" />
        </div>
        <div class="booru-detail__body">
          <h2>#{{ store.selectedPost?.id }}</h2>
          <div class="booru-meta">
            <span v-if="store.selectedPost?.author" class="booru-meta__author">
              作者：
              <button type="button" class="booru-author" :title="`搜索 ${store.selectedPost.author} 的作品`" @click="store.searchAuthor(store.selectedPost!.author)">{{ store.selectedPost.author }}</button>
              <button type="button" class="booru-author-copy" title="复制作者名" @click="copyAuthor">复制</button>
            </span>
            <span v-if="store.selectedPost?.uploader">上传者：{{ store.selectedPost.uploader }}</span>
            <span v-if="store.selectedPost?.width">尺寸：{{ store.selectedPost.width }}×{{ store.selectedPost.height }}</span>
            <span v-if="store.selectedPost?.fileSize">大小：{{ (store.selectedPost.fileSize / 1024 / 1024).toFixed(2) }} MB</span>
            <span>评分：{{ store.selectedPost?.score ?? 0 }}</span>
            <a v-if="store.selectedPost?.source" :href="store.selectedPost.source" target="_blank" rel="noreferrer">来源链接</a>
            <a v-if="store.selectedPost?.postUrl" :href="store.selectedPost.postUrl" target="_blank" rel="noreferrer">站内页面</a>
          </div>
          <div class="booru-tags">
            <span v-for="tag in store.selectedPost?.tags || []" :key="tag" class="booru-tag">{{ tag }}</span>
          </div>
          <div class="booru-detail__actions">
            <button class="booru-button" type="button" :class="{ 'booru-button--active': store.selectedPost && store.isFavorite(store.selectedPost) }" @click="store.selectedPost && store.toggleFavorite(store.selectedPost)">收藏</button>
            <button class="booru-button" type="button" @click="copyPrompt">复制提示词</button>
            <button class="booru-button booru-button--primary" type="button" @click="downloadPost">下载原图</button>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.booru-page {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 16px 18px 12px;
  gap: 10px;
  overflow: hidden;
  background:
    radial-gradient(1200px 500px at 78% -20%, color-mix(in srgb, var(--brand-primary) 13%, transparent), transparent 60%),
    radial-gradient(900px 420px at 8% 0%, color-mix(in srgb, var(--action-accent) 8%, transparent), transparent 55%),
    var(--app-bg);
  color: var(--text-primary);
}

.booru-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 4px;
}
.booru-toolbar__spacer { flex: 1 1 auto; }
.booru-toolbar-action {
  font: inherit;
  height: 34px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
}
.booru-toolbar-action:hover,
.booru-toolbar-action.active {
  border-color: var(--glass-border-hover);
  background: var(--glass-bg-hover);
  color: var(--text-primary);
}

.booru-hero {
  display: grid;
  gap: 12px;
  padding: 4px 2px 8px;
}
.booru-hero__search {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.booru-hero__search .booru-search-wrap { width: min(720px, 100%); }
.booru-search-submit {
  height: 34px;
  padding: 0 16px;
  border: 0;
  border-radius: 10px;
  background: var(--gradient-accent);
  color: var(--brand-on-primary);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}
.booru-sites {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 7px;
}
.booru-site-pill {
  padding: 6px 11px;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  background: var(--glass-bg);
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
}
.booru-site-pill:hover,
.booru-site-pill.active {
  border-color: var(--brand-primary);
  background: color-mix(in srgb, var(--brand-primary) 16%, transparent);
  color: var(--text-primary);
}
.booru-site-pill--add { color: var(--brand-primary); }
.booru-filterbar { display: flex; align-items: center; gap: 8px; }
.booru-chip {
  padding: 6px 11px;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  background: var(--glass-bg);
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.booru-chip.active { border-color: var(--brand-primary); color: var(--text-primary); }
.booru-filters { display: flex; gap: 7px; flex-wrap: wrap; }
.booru-fab {
  position: fixed;
  right: 18px;
  bottom: 22px;
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.booru-fab__btn {
  width: 42px;
  height: 42px;
  border: 1px solid var(--glass-border-hover);
  border-radius: 50%;
  background: color-mix(in srgb, var(--surface-primary) 78%, transparent);
  color: var(--text-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  backdrop-filter: blur(12px);
  box-shadow: var(--shadow-md);
  transition: background var(--transition-fast), color var(--transition-fast), transform var(--transition-fast);
}
.booru-fab__btn:hover,
.booru-fab__btn.active { background: var(--brand-primary); color: var(--brand-on-primary); transform: translateY(-1px); }

.booru-modal {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(0 0 0 / 58%);
  backdrop-filter: blur(8px);
}
.booru-modal__card {
  width: min(720px, 100%);
  max-height: 88vh;
  overflow: auto;
  border: 1px solid var(--glass-border-hover);
  border-radius: 20px;
  background: var(--surface-primary);
  box-shadow: var(--shadow-lg);
}
.booru-modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 17px 20px 15px;
  border-bottom: 1px solid var(--line-subtle);
}
.booru-modal__head h2 { margin: 0; font-size: 18px; }
.booru-modal__close {
  width: 30px;
  height: 30px;
  border: 1px solid var(--glass-border);
  border-radius: 50%;
  background: var(--surface-secondary);
  color: var(--text-secondary);
  font-size: 19px;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.booru-modal__close:hover { background: var(--brand-primary); color: var(--brand-on-primary); }
.booru-settings__section {
  display: grid;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--line-subtle);
}
.booru-settings__section h3 { margin: 0; color: var(--text-secondary); font-size: 13px; }
.booru-settings__hint { margin: -4px 0 0; color: var(--text-tertiary); font-size: 12px; }
.booru-settings__credentials { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.booru-site-cred {
  display: grid;
  gap: 10px;
  padding: 13px;
  border: 1px solid var(--glass-border);
  border-radius: 13px;
  background: var(--glass-bg);
}
.booru-site-cred strong { font-size: 13px; }
.booru-field { display: grid; gap: 6px; color: var(--text-secondary); font-size: 12px; }
.booru-field .booru-input { width: 100%; }
.booru-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 20px 18px;
}
.booru-folder-row { display: flex; gap: 8px; }
.booru-folder-row .booru-input { flex: 1; }
.booru-progress { margin: 0; color: var(--text-secondary); font-size: 12px; }

.booru-title h1 {
  margin: 0;
  background: var(--gradient-hero);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  font-size: 21px;
  letter-spacing: .02em;
}
.booru-eyebrow {
  display: inline-flex;
  width: fit-content;
  margin-bottom: 2px;
  padding: 3px 7px;
  border: 1px solid var(--glass-border-hover);
  border-radius: 999px;
  background: var(--glass-bg);
  color: var(--brand-primary);
  font-size: 8px;
  font-weight: 750;
  letter-spacing: .14em;
}
.booru-title p { margin: 4px 0 0; color: var(--text-secondary); font-size: 13px; }

.booru-add,
.booru-button {
  font: inherit;
  border: 1px solid var(--glass-border);
  cursor: pointer;
  border-radius: var(--radius-control);
  background: color-mix(in srgb, var(--surface-secondary) 78%, transparent);
  color: var(--text-primary);
  padding: 9px 15px;
  backdrop-filter: blur(14px);
  transition: border-color var(--transition-fast), background-color var(--transition-fast), transform var(--transition-fast), box-shadow var(--transition-fast);
}
.booru-add:hover,
.booru-button:hover {
  border-color: var(--glass-border-hover);
  background: var(--glass-bg-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}
.booru-button--primary {
  border-color: transparent;
  background: var(--gradient-accent);
  color: var(--brand-on-primary);
  font-weight: 650;
}
.booru-button--primary:hover { background: var(--brand-hover); }
.booru-button--active {
  border-color: var(--brand-primary);
  background: color-mix(in srgb, var(--brand-primary) 18%, transparent);
  color: var(--text-primary);
}

.booru-add-panel,
.booru-toolbar {
  display: flex;
  gap: 9px;
  flex-wrap: wrap;
  padding: 7px 9px;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-panel);
  background: color-mix(in srgb, var(--surface-primary) 74%, transparent);
  backdrop-filter: blur(18px);
  box-shadow: var(--shadow-sm);
}

.booru-credentials {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-panel);
  background: color-mix(in srgb, var(--surface-primary) 74%, transparent);
  backdrop-filter: blur(18px);
  box-shadow: var(--shadow-sm);
}
.booru-credentials h2 { margin: 0; font-size: 15px; }
.booru-credentials p { margin: 0; color: var(--text-secondary); font-size: 12px; }
.booru-credential { display: grid; grid-template-columns: 110px 1fr 1fr; gap: 8px; align-items: center; }
.booru-credential > span { color: var(--text-secondary); font-size: 13px; }

.booru-input,
.booru-select {
  min-width: 0;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--line-subtle);
  border-radius: var(--radius-control);
  background: var(--surface-secondary);
  color: var(--text-primary);
  font: inherit;
  outline: none;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}
.booru-input:focus,
.booru-select:focus {
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand-primary) 18%, transparent);
}
.booru-search { flex: 1 1 240px; }
.booru-search-wrap { position: relative; display: flex; flex: 1 1 240px; min-width: 0; }
.booru-suggestions {
  position: absolute;
  z-index: 20;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  display: grid;
  gap: 2px;
  max-height: 300px;
  overflow: auto;
  padding: 6px;
  border: 1px solid var(--glass-border-hover);
  border-radius: 12px;
  background: var(--surface-primary);
  box-shadow: var(--shadow-lg);
}
.booru-suggestion {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 9px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
  text-align: left;
}
.booru-suggestion:hover { background: var(--glass-bg-hover); }
.booru-suggestion b { font-weight: 620; }
.booru-suggestion i { color: var(--text-tertiary); font-style: normal; font-size: 11px; }

.booru-related {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  padding: 10px;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-panel);
  background: color-mix(in srgb, var(--surface-primary) 70%, transparent);
  backdrop-filter: blur(18px);
}
.booru-related__label { color: var(--text-secondary); font-size: 12px; }
.booru-related__tag {
  padding: 4px 9px;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  background: var(--glass-bg);
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
}
.booru-related__tag:hover { background: var(--glass-bg-hover); color: var(--text-primary); border-color: var(--glass-border-hover); }
.booru-related__tag i { margin-left: 4px; color: var(--text-tertiary); font-style: normal; }

.booru-error {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
  margin: 0;
  padding: 9px 12px;
  border: 1px solid rgba(248, 113, 113, .28);
  border-radius: var(--radius-control);
  background: var(--danger-bg);
  color: var(--danger-foreground);
  font-size: 13px;
}
.booru-error__retry {
  flex: none;
  padding: 5px 10px;
  border: 1px solid rgba(248, 113, 113, .3);
  border-radius: 7px;
  background: transparent;
  color: var(--danger-foreground);
  font: inherit;
  cursor: pointer;
}
.booru-error__retry:hover { background: rgba(248, 113, 113, .12); }

.booru-grid {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  grid-auto-rows: minmax(220px, 270px);
  grid-auto-flow: dense;
  gap: 12px;
  align-content: start;
  padding: 2px;
}

.booru-card {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  overflow: hidden;
  background: var(--surface-secondary);
  cursor: zoom-in;
  box-shadow: var(--shadow-sm);
  transition: border-color var(--transition-base), box-shadow var(--transition-base), transform var(--transition-base);
}
.booru-card:hover {
  border-color: var(--brand-primary);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg), 0 0 0 2px color-mix(in srgb, var(--brand-primary) 20%, transparent);
}
.booru-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform var(--transition-slow);
}
.booru-card:hover img { transform: scale(1.06); }
.booru-card__overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 48%, rgb(0 0 0 / 72%) 100%);
  opacity: .85;
  pointer-events: none;
}
.booru-card__meta {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #fff;
  font-size: 11px;
  text-shadow: 0 1px 2px rgb(0 0 0 / 65%);
}
.booru-card__meta b { font-weight: 650; }
.booru-card__meta i {
  padding: 2px 7px;
  border: 1px solid rgb(255 255 255 / 22%);
  border-radius: 999px;
  background: rgb(255 255 255 / 10%);
  font-style: normal;
  text-transform: capitalize;
  backdrop-filter: blur(8px);
}
.booru-card__check {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 1px solid rgb(255 255 255 / 42%);
  border-radius: 7px;
  background: rgb(0 0 0 / 48%);
  color: #fff;
  font-size: 14px;
  backdrop-filter: blur(8px);
}
.booru-card__check--active {
  border-color: var(--brand-primary);
  background: var(--brand-primary);
}
.booru-card--selected { border-color: var(--brand-primary); }

.booru-more {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  font-size: 12px;
  color: var(--text-secondary);
}

.booru-detail {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 28px;
  background: rgb(0 0 0 / 62%);
  backdrop-filter: blur(8px);
}
.booru-detail__panel {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(280px, .65fr);
  grid-template-rows: minmax(0, 1fr);
  width: min(1000px, 100%);
  max-height: 90vh;
  overflow: hidden;
  border: 1px solid var(--glass-border-hover);
  border-radius: 20px;
  background: var(--surface-primary);
  color: var(--text-primary);
  box-shadow: var(--shadow-lg);
}
.booru-detail__close {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
  width: 34px;
  height: 34px;
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 50%;
  background: rgb(0 0 0 / 55%);
  color: #fff;
  font-size: 22px;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition: background var(--transition-fast), transform var(--transition-fast);
}
.booru-detail__close:hover { background: var(--brand-primary); transform: rotate(90deg); }
.booru-detail__image {
  min-height: 0;
  display: grid;
  place-items: center;
  background:
    radial-gradient(800px 320px at 50% 0%, color-mix(in srgb, var(--brand-primary) 10%, transparent), transparent 60%),
    #000;
}
.booru-detail__image img { max-width: 100%; max-height: 88vh; object-fit: contain; }
.booru-detail__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 24px;
  overflow: auto;
  min-width: 0;
  min-height: 0;
}
.booru-detail__body h2 { margin: 0; font-size: 20px; }
.booru-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  color: var(--text-secondary);
  font-size: 12px;
}
.booru-meta a { color: var(--brand-primary); }
.booru-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  align-content: flex-start;
}
.booru-tag {
  max-width: 100%;
  padding: 4px 9px;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  background: var(--glass-bg);
  color: var(--text-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
  white-space: normal;
  transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
}
.booru-tag:hover { background: var(--glass-bg-hover); color: var(--text-primary); border-color: var(--glass-border-hover); }
.booru-prompt {
  width: 100%;
  min-height: 96px;
  resize: vertical;
  padding: 11px;
  border: 1px solid var(--line-subtle);
  border-radius: 12px;
  background: var(--surface-secondary);
  color: var(--text-primary);
  font: inherit;
}
.booru-detail__actions {
  position: sticky;
  bottom: 0;
  display: flex;
  gap: 9px;
  padding: 10px 0 0;
  background: var(--surface-primary);
}
.booru-meta__author { display: inline-flex; align-items: center; gap: 6px; }.booru-author { padding: 0; border: 0; background: transparent; color: var(--brand-primary); font: inherit; font-size: 12px; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }.booru-author:hover { color: var(--brand-hover); }.booru-author-copy { padding: 1px 6px; border: 1px solid var(--glass-border); border-radius: 6px; background: var(--glass-bg); color: var(--text-tertiary); font: inherit; font-size: 10px; cursor: pointer; }.booru-author-copy:hover { color: var(--text-primary); border-color: var(--glass-border-hover); }
</style>
