<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { toBooruImgUrl } from '@/lib/booru-img-url'
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
        <h1>素材画廊 <span class="booru-title__flower" aria-hidden="true">✿</span></h1>
        <p>在 {{ store.sites.length || '各' }} 个图站里搜标签、收藏、批量下载</p>
      </div>
      <div class="booru-header__stats" aria-hidden="true">
        <span class="sticker is-lavender"><b>{{ store.posts.length }}</b> 张结果</span>
        <span v-if="store.favorites?.length" class="sticker is-peach"><b>{{ store.favorites.length }}</b> 收藏</span>
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
        <img :src="toBooruImgUrl(post.previewUrl || post.sampleUrl)" :alt="post.id" loading="lazy" />
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
      <p v-if="store.loading"><span class="booru-more__spinner" aria-hidden="true"></span>加载中…</p>
      <p v-else-if="store.ended && store.posts.length">没有更多了 ✿</p>
    </div>

    <div v-if="batchMode" class="booru-batchbar" role="toolbar" aria-label="批量操作">
      <span class="booru-batchbar__count"><b>{{ selectedIds.size }}</b> 张已选</span>
      <button class="booru-batchbar__primary" type="button" :disabled="selectedIds.size === 0" @click="showBatchDialog = true">批量下载</button>
      <button type="button" :disabled="selectedIds.size === 0" @click="selectedIds.clear()">清空</button>
      <button type="button" class="booru-batchbar__exit" @click="toggleBatchMode">退出多选</button>
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
          <img v-if="store.selectedImage" :src="toBooruImgUrl(store.selectedImage)" alt="" />
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
/* ── 在线画廊 · 柔粉治愈灵动版 ── */
.booru-page { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0; padding: 12px 6px 8px 8px; gap: 12px; overflow: hidden; background: transparent; color: var(--ink-primary); }

/* 标题区 */
.booru-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; padding: 6px 10px 0; }
.booru-title { display: grid; gap: 4px; }
.booru-eyebrow { display: inline-flex; width: fit-content; padding: 4px 10px; border-radius: 999px; background: var(--accent-lavender-soft); color: var(--accent-lavender-strong); font-family: var(--font-mono); font-size: 9.5px; font-weight: 800; letter-spacing: .14em; transform: rotate(-2deg); }
.booru-title h1 { margin: 2px 0 0; color: var(--ink-primary); font-size: 26px; font-weight: 900; letter-spacing: -0.01em; line-height: 1.1; }
.booru-title__flower { color: var(--brand-primary); font-size: 20px; }
.booru-title p { margin: 0; color: var(--ink-tertiary); font-size: 12.5px; }
.booru-header__stats { display: flex; gap: 10px; align-items: center; padding-bottom: 4px; }
.booru-header__stats .sticker { height: 32px; font-size: 12px; }
.booru-header__stats .sticker:first-child { transform: rotate(-3deg); }
.booru-header__stats .sticker:last-child { transform: rotate(2deg); }

/* 工具栏：白卡片 + 胶囊控件 */
.booru-add-panel, .booru-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 10px; border: 0; border-radius: 26px; background: var(--surface-primary); box-shadow: var(--surface-shadow); }
.booru-toolbar__spacer { flex: 1 1 auto; }
.booru-input, .booru-select { min-width: 0; height: 36px; padding: 0 14px; border: 1px solid transparent; border-radius: 999px; background: var(--surface-secondary); color: var(--ink-primary); font: inherit; font-size: 12.5px; font-weight: 600; outline: none; transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background-color var(--transition-fast); }
.booru-select { appearance: none; padding-right: 30px; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23ad8f9f' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; cursor: pointer; }
.booru-input::placeholder { color: var(--ink-tertiary); font-weight: 500; }
.booru-input:focus, .booru-select:focus { border-color: var(--brand-primary); background-color: var(--surface-primary); box-shadow: 0 0 0 4px var(--brand-soft); }
.booru-search { flex: 1 1 240px; }
.booru-search-wrap { position: relative; display: flex; flex: 1 1 260px; min-width: 0; align-items: center; }
.booru-search-wrap .booru-input { padding-right: 78px; width: 100%; }
.booru-search-submit { position: absolute; right: 4px; top: 4px; height: 28px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--brand-gradient); color: var(--brand-on-primary); font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; box-shadow: 0 6px 14px rgba(var(--brand-primary-rgb), .3); transition: transform var(--transition-fast); }
.booru-search-submit:hover { transform: translateY(-1px); }
.booru-search-submit:active { transform: scale(.96); }
.booru-suggestions { position: absolute; z-index: 20; top: calc(100% + 8px); left: 0; right: 0; display: grid; gap: 2px; max-height: 300px; overflow: auto; padding: 6px; border: 0; border-radius: 20px; background: var(--surface-primary); box-shadow: var(--surface-shadow-lg); }
.booru-suggestion { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 12px; border: 0; border-radius: 12px; background: transparent; color: var(--ink-primary); font: inherit; text-align: left; cursor: pointer; }
.booru-suggestion:hover { background: var(--brand-tint); }
.booru-suggestion b { font-size: 12.5px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.booru-suggestion i { flex: none; color: var(--ink-tertiary); font: 10.5px var(--font-mono); font-style: normal; }
.booru-add, .booru-button { height: 36px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--surface-secondary); color: var(--ink-secondary); font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; white-space: nowrap; transition: background-color var(--transition-fast), color var(--transition-fast), transform var(--transition-fast); }
.booru-add:hover, .booru-button:hover { background: var(--brand-soft); color: var(--brand-hover); }
.booru-button:active { transform: scale(.96); }
.booru-button:disabled { opacity: .4; cursor: not-allowed; transform: none; }
.booru-button--active { background: var(--brand-primary); color: var(--brand-on-primary); box-shadow: 0 8px 18px rgba(var(--brand-primary-rgb), .28); }
.booru-button--active:hover { background: var(--brand-hover); color: #fff; }
.booru-button--primary { background: var(--brand-gradient); color: var(--brand-on-primary); box-shadow: 0 8px 18px rgba(var(--brand-primary-rgb), .3); }
.booru-button--primary:hover { color: #fff; }
.booru-toolbar-action { height: 36px; padding: 0 12px; border: 0; border-radius: 999px; background: transparent; color: var(--ink-tertiary); font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: background-color var(--transition-fast), color var(--transition-fast); }
.booru-toolbar-action:hover, .booru-toolbar-action.active { background: var(--brand-tint); color: var(--brand-hover); }

/* 旧的英雄区 / 站点药丸 / 筛选条（模板里可能还会用到） */
.booru-hero { display: grid; gap: 12px; padding: 4px 2px 8px; }
.booru-hero__search { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.booru-hero__search .booru-search-wrap { width: min(720px, 100%); }
.booru-filterbar, .booru-filters { display: flex; gap: 7px; flex-wrap: wrap; }
.booru-chip { padding: 6px 12px; border: 0; border-radius: 999px; background: var(--brand-tint); color: var(--ink-secondary); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.booru-chip.active { background: var(--brand-primary); color: var(--brand-on-primary); }
.booru-sites { display: flex; gap: 6px; flex-wrap: wrap; }
.booru-site-pill { height: 32px; padding: 0 12px; border: 0; border-radius: 999px; background: var(--surface-secondary); color: var(--ink-secondary); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.booru-site-pill:hover, .booru-site-pill.active { background: var(--brand-primary); color: var(--brand-on-primary); }
.booru-site-pill--add { background: transparent; border: 1.5px dashed var(--line-strong); color: var(--ink-tertiary); }
.booru-fab { position: fixed; right: 18px; bottom: 44px; z-index: 40; display: flex; flex-direction: column; gap: 8px; }
.booru-fab__btn { width: 44px; height: 44px; border: 0; border-radius: 50%; background: var(--surface-primary); color: var(--ink-secondary); box-shadow: var(--surface-shadow); cursor: pointer; font: inherit; }
.booru-fab__btn:hover, .booru-fab__btn.active { background: var(--brand-primary); color: var(--brand-on-primary); }

/* 错误 / 相关标签 */
.booru-error { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 4px; padding: 10px 16px; border-radius: 999px; background: var(--danger-bg); color: var(--danger-foreground); font-size: 12.5px; font-weight: 600; }
.booru-error__retry { height: 30px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--surface-primary); color: var(--danger-foreground); font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; }
.booru-error__retry:hover { background: #fff; }
.booru-related { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 0 8px; }
.booru-related__label { margin-right: 4px; color: var(--ink-tertiary); font-size: 11px; font-weight: 800; letter-spacing: .04em; }
.booru-related__tag { height: 28px; padding: 0 11px; border: 0; border-radius: 999px; background: var(--surface-primary); color: var(--ink-secondary); font: inherit; font-size: 11.5px; font-weight: 700; cursor: pointer; box-shadow: var(--shadow-sm); transition: transform var(--transition-fast), background-color var(--transition-fast), color var(--transition-fast); }
.booru-related__tag i { margin-left: 4px; color: var(--ink-quaternary); font: 10px var(--font-mono); font-style: normal; }
.booru-related__tag:hover { background: var(--brand-soft); color: var(--brand-hover); transform: translateY(-1px); }
.booru-related__tag:nth-child(3n) { background: var(--accent-lavender-soft); }
.booru-related__tag:nth-child(5n) { background: var(--accent-mint-soft); }

/* 结果网格：圆角卡 + 悬停抬起 + 粉色选中环 */
.booru-grid { flex: 1; min-height: 0; overflow: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); grid-auto-rows: minmax(220px, 270px); grid-auto-flow: dense; gap: 14px; align-content: start; padding: 6px 10px 110px 6px; scrollbar-gutter: stable; }
.booru-card { position: relative; display: block; width: 100%; height: 100%; padding: 0; border: 0; border-radius: 22px; overflow: hidden; background: var(--surface-tertiary); cursor: zoom-in; box-shadow: 0 8px 18px rgba(74,45,61,.08); transition: box-shadow .2s ease, transform .25s var(--ease-bounce); }
.booru-card:hover { transform: translateY(-3px) scale(1.02); box-shadow: var(--surface-shadow-lg); z-index: 2; }
.booru-card img { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform .35s ease; }
.booru-card:hover img { transform: scale(1.04); }
.booru-card--selected { box-shadow: 0 0 0 4px var(--brand-primary), var(--surface-shadow); }
.booru-card__overlay { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 55%, rgba(74,45,61,.55)); opacity: 0; transition: opacity .2s ease; pointer-events: none; }
.booru-card:hover .booru-card__overlay, .booru-card--selected .booru-card__overlay { opacity: 1; }
.booru-card__check { position: absolute; top: 10px; left: 10px; width: 26px; height: 26px; display: grid; place-items: center; border: 2px solid rgba(255,255,255,.9); border-radius: 50%; background: rgba(74,45,61,.28); color: #fff; font-size: 13px; font-weight: 900; backdrop-filter: blur(6px); transition: transform .2s var(--ease-bounce), background-color .15s ease; }
.booru-card__check--active { background: var(--brand-primary); border-color: #fff; transform: scale(1.08); }
.booru-card__meta { position: absolute; left: 10px; right: 10px; bottom: 10px; display: flex; justify-content: space-between; align-items: center; gap: 6px; opacity: 0; transform: translateY(4px); transition: opacity .2s ease, transform .2s ease; }
.booru-card:hover .booru-card__meta { opacity: 1; transform: none; }
.booru-card__meta b { padding: 3px 9px; border-radius: 999px; background: rgba(255,255,255,.92); color: var(--ink-secondary); font: 10px var(--font-mono); font-weight: 700; }
.booru-card__meta i { padding: 3px 9px; border-radius: 999px; background: var(--brand-primary); color: #fff; font-size: 9.5px; font-weight: 800; font-style: normal; text-transform: uppercase; letter-spacing: .04em; }
.booru-more { flex: none; display: flex; justify-content: center; min-height: 18px; }
.booru-more p { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--ink-tertiary); font-size: 11.5px; font-weight: 600; }
.booru-more__spinner { width: 12px; height: 12px; border: 2px solid var(--brand-soft); border-top-color: var(--brand-primary); border-radius: 50%; animation: booru-spin .8s linear infinite; }
@keyframes booru-spin { to { transform: rotate(360deg); } }

/* 多选时的深梅子悬浮操作条 */
.booru-batchbar { position: absolute; z-index: 12; left: 50%; bottom: 40px; transform: translateX(-50%) rotate(-1deg); display: flex; align-items: center; gap: 8px; height: 56px; padding: 8px 10px 8px 18px; border-radius: 999px; background: var(--ink-primary); color: var(--surface-primary); box-shadow: 0 20px 44px rgba(74,45,61,.35); }
.booru-batchbar__count { display: flex; align-items: baseline; gap: 5px; margin-right: 6px; color: rgba(255,255,255,.7); font-size: 11px; }
.booru-batchbar__count b { color: var(--brand-primary); font-size: 16px; font-weight: 900; }
.booru-batchbar button { height: 34px; padding: 0 14px; border: 0; border-radius: 999px; background: rgba(255,255,255,.1); color: #fff; font: inherit; font-size: 11.5px; font-weight: 700; cursor: pointer; white-space: nowrap; transition: background-color 140ms ease, transform 160ms var(--ease-bounce); }
.booru-batchbar button:hover:not(:disabled) { background: rgba(255,255,255,.18); }
.booru-batchbar button:disabled { opacity: .4; cursor: not-allowed; }
.booru-batchbar__primary { background: var(--brand-gradient) !important; box-shadow: 0 8px 20px rgba(var(--brand-primary-rgb), .35); }
.booru-batchbar__exit { background: transparent !important; color: rgba(255,255,255,.6) !important; }

/* 弹窗（设置 / 添加图站 / 批量下载） */
.booru-modal { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: 24px; background: rgba(74,45,61,.32); backdrop-filter: blur(9px); }
.booru-modal__card { width: min(720px, 100%); max-height: 88vh; overflow: auto; border: 0; border-radius: 28px; background: var(--surface-primary); box-shadow: 0 30px 80px rgba(255,126,182,.28); color: var(--ink-primary); }
.booru-modal__head { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 12px; }
.booru-modal__head h2 { margin: 0; font-size: 18px; font-weight: 900; }
.booru-modal__close { width: 32px; height: 32px; border: 0; border-radius: 50%; background: var(--surface-secondary); color: var(--ink-secondary); font-size: 18px; line-height: 1; cursor: pointer; }
.booru-modal__close:hover { background: var(--danger-bg); color: var(--danger-foreground); }
.booru-modal__footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 24px 22px; }
.booru-settings__section { display: grid; gap: 12px; padding: 8px 24px 12px; }
.booru-settings__section h3 { margin: 4px 0 0; color: var(--ink-tertiary); font-size: 11.5px; font-weight: 800; letter-spacing: .06em; }
.booru-settings__hint { color: var(--ink-tertiary); font-size: 12px; line-height: 1.6; }
.booru-settings__credentials { display: grid; gap: 10px; }
.booru-field { display: grid; gap: 6px; color: var(--ink-tertiary); font-size: 11.5px; font-weight: 700; }
.booru-field .booru-input { width: 100%; height: 38px; border-radius: 14px; }
.booru-folder-row { display: flex; gap: 8px; }
.booru-folder-row .booru-input { flex: 1; }
.booru-site-cred { display: grid; grid-template-columns: 96px 1fr 1fr; gap: 10px; align-items: end; padding: 12px 14px; border-radius: 18px; background: var(--surface-secondary); }
.booru-site-cred strong { padding-bottom: 10px; font-size: 13px; font-weight: 900; }
.booru-site-cred .booru-input { background: var(--surface-primary); }
.booru-credentials { display: grid; gap: 10px; }
.booru-credentials h2 { margin: 0; font-size: 15px; font-weight: 900; }
.booru-credentials p { margin: 0; color: var(--ink-tertiary); font-size: 12px; }
.booru-credential { display: grid; gap: 6px; }
.booru-credential > span { color: var(--ink-tertiary); font-size: 11.5px; font-weight: 700; }
.booru-progress { margin: 0; padding: 8px 12px; border-radius: 999px; background: var(--brand-tint); color: var(--brand-hover); font: 12px var(--font-mono); font-weight: 700; }

/* 详情面板 */
.booru-detail { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 28px; background: rgba(74,45,61,.4); backdrop-filter: blur(10px); }
.booru-detail__panel { position: relative; display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(300px, .65fr); grid-template-rows: minmax(0, 1fr); width: min(1060px, 100%); max-height: 90vh; overflow: hidden; border: 0; border-radius: 30px; background: var(--surface-primary); color: var(--ink-primary); box-shadow: 0 30px 80px rgba(74,45,61,.35); }
.booru-detail__close { position: absolute; z-index: 3; top: 14px; right: 14px; width: 36px; height: 36px; border: 0; border-radius: 50%; background: var(--surface-primary); color: var(--ink-secondary); box-shadow: var(--surface-shadow); font-size: 20px; line-height: 1; cursor: pointer; }
.booru-detail__close:hover { background: var(--danger-bg); color: var(--danger-foreground); }
.booru-detail__image { position: relative; min-height: 0; display: grid; place-items: center; padding: 22px; background: var(--surface-secondary); background-image: radial-gradient(var(--line-strong) 1px, transparent 1.2px); background-size: 22px 22px; }
.booru-detail__image img { max-width: 100%; max-height: calc(90vh - 44px); object-fit: contain; border-radius: 18px; box-shadow: var(--ink-shadow); }
.booru-detail__body { display: flex; flex-direction: column; gap: 14px; padding: 24px 22px 20px; overflow: auto; scrollbar-width: thin; }
.booru-detail__body h2 { margin: 0; padding-right: 40px; font-size: 20px; font-weight: 900; color: var(--ink-primary); }
.booru-meta { display: flex; flex-wrap: wrap; gap: 6px 8px; color: var(--ink-secondary); font-size: 12px; }
.booru-meta > span, .booru-meta a { display: inline-flex; align-items: center; gap: 4px; padding: 5px 11px; border-radius: 999px; background: var(--surface-secondary); font-weight: 600; }
.booru-meta a { color: var(--brand-hover); text-decoration: none; }
.booru-meta a:hover { background: var(--brand-soft); }
.booru-meta__author { background: var(--accent-lavender-soft) !important; }
.booru-author, .booru-author-copy { border: 0; background: transparent; color: var(--accent-lavender-strong); font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; padding: 0 2px; }
.booru-author:hover { text-decoration: underline; }
.booru-author-copy { color: var(--ink-tertiary); font-weight: 600; }
.booru-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.booru-tag { padding: 5px 11px; border-radius: 999px; background: var(--brand-tint); color: var(--ink-secondary); font-size: 11.5px; font-weight: 700; cursor: default; }
.booru-tag:nth-child(3n) { background: var(--accent-lavender-soft); }
.booru-tag:nth-child(5n) { background: var(--accent-mint-soft); }
.booru-tag:hover { background: var(--brand-soft); color: var(--brand-hover); }
.booru-prompt { margin: 0; padding: 10px 12px; border-radius: 14px; background: var(--surface-secondary); color: var(--ink-secondary); font-size: 11.5px; line-height: 1.6; }
.booru-detail__actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: auto; padding-top: 8px; }

@media (max-width: 1100px) { .booru-header__stats { display: none; } }
@media (max-width: 900px) {
  .booru-detail__panel { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1.2fr) minmax(0, .8fr); }
  .booru-site-cred { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .booru-card, .booru-card img, .booru-related__tag, .booru-button, .booru-search-submit { transition: none; }
  .booru-card:hover { transform: none; }
  .booru-card:hover img { transform: none; }
  .booru-more__spinner { animation-duration: 1.8s; }
}
</style>
