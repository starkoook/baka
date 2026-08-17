import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

const SITES_KEY = 'baka-booru-sites'
const SETTINGS_KEY = 'baka-booru-settings'
const HISTORY_KEY = 'baka-booru-history'
const FAVORITES_KEY = 'baka-booru-favorites'

export const useBooruGalleryStore = defineStore('booruGallery', () => {
  const sites = ref<BooruGallerySite[]>([])
  const activeSiteId = ref('danbooru')
  const query = ref('')
  const rating = ref('all')
  const sort = ref('latest')
  const rankingPeriod = ref('none')
  const posts = ref<BooruGalleryPost[]>([])
  const page = ref(1)
  const nextPage = ref<number | null>(null)
  const ended = ref(false)
  const loading = ref(false)
  const error = ref('')
  const selectedPost = ref<BooruGalleryPost | null>(null)
  const selectedImage = ref('')
  const settings = ref<BooruGallerySettings>({
    proxy: 'http://127.0.0.1:7890',
    timeout: 30,
    credentials: {
      danbooru: { username: '', apiKey: '' },
      gelbooru: { userId: '', apiKey: '' },
      e621: { username: '', apiKey: '' },
      derpibooru: { apiKey: '' },
    },
  })
  const suggestions = ref<BooruGalleryTag[]>([])
  const relatedTags = ref<BooruGalleryTag[]>([])
  const searchHistory = ref<string[]>([])
  const favorites = ref<BooruGalleryPost[]>([])

  const activeSite = computed(() => sites.value.find((site) => site.id === activeSiteId.value) ?? null)
  const promptText = computed(() => (selectedPost.value?.tags || []).join(', '))

  async function loadSites() {
    const result = await window.booruGalleryAPI.listSites()
    if (result.success) {
      sites.value = result.sites
      if (!sites.value.some((site) => site.id === activeSiteId.value)) {
        activeSiteId.value = sites.value[0]?.id || 'danbooru'
      }
    } else {
      error.value = result.error || '无法读取图站列表'
    }
  }

  function loadLocalData() {
    try {
      searchHistory.value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
      favorites.value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]')
    } catch {
      searchHistory.value = []
      favorites.value = []
    }
  }

  function addHistory(queryText: string) {
    const value = queryText.trim()
    if (!value) return
    searchHistory.value = [value, ...searchHistory.value.filter((item) => item !== value)].slice(0, 12)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(searchHistory.value))
  }

  function toggleFavorite(post: BooruGalleryPost) {
    const index = favorites.value.findIndex((item) => item.id === post.id)
    if (index >= 0) favorites.value.splice(index, 1)
    else favorites.value.unshift({ ...post })
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites.value))
  }

  function isFavorite(post: BooruGalleryPost) {
    return favorites.value.some((item) => item.id === post.id)
  }

  async function loadSettings() {
    const result = await window.booruGalleryAPI.getSettings()
    if (result.success) settings.value = result.settings
  }

  async function saveSettings() {
    const result = await window.booruGalleryAPI.saveSettings({ ...settings.value })
    if (result.success) settings.value = result.settings
  }

  async function search(reset = true) {
    if (!activeSite.value || loading.value) return
    if (reset) {
      posts.value = []
      page.value = 1
      nextPage.value = null
      ended.value = false
      error.value = ''
    }
    loading.value = true
    const pageNumber = reset ? 1 : page.value + 1
    const result = rankingPeriod.value === 'none'
      ? await window.booruGalleryAPI.search({
          siteId: activeSiteId.value,
          query: query.value,
          page: pageNumber,
          limit: 40,
          rating: rating.value === 'all' ? undefined : rating.value,
          sort: sort.value,
        })
      : await window.booruGalleryAPI.ranking({
          siteId: activeSiteId.value,
          period: rankingPeriod.value,
          page: pageNumber,
          limit: 40,
        })
    loading.value = false
    if (!result.success) {
      error.value = result.error || '搜索失败'
      return
    }
    posts.value = reset ? result.posts || [] : [...posts.value, ...(result.posts || [])]
    nextPage.value = result.nextPage ?? null
    ended.value = Boolean(result.ended)
    if (result.nextPage) page.value = result.nextPage - 1
  }

  async function loadMore() {
    if (loading.value || ended.value || nextPage.value == null) return
    await search(false)
  }

  async function fetchSuggestions(prefix: string) {
    if (!activeSite.value || !prefix.trim()) {
      suggestions.value = []
      return
    }
    const result = await window.booruGalleryAPI.tagSuggest({ siteId: activeSiteId.value, prefix })
    suggestions.value = result.success ? result.tags || [] : []
  }

  async function fetchRelatedTags(queryText: string) {
    if (!activeSite.value || !queryText.trim()) {
      relatedTags.value = []
      return
    }
    const result = await window.booruGalleryAPI.relatedTags({ siteId: activeSiteId.value, query: queryText })
    relatedTags.value = result.success ? result.tags || [] : []
  }

  function addTagToQuery(tag: string) {
    const trimmed = tag.trim()
    if (!trimmed) return
    const current = query.value.trim()
    query.value = current ? `${current} ${trimmed}` : trimmed
  }

  function searchAuthor(author: string) {
    const name = String(author || '').trim()
    if (!name || !activeSite.value) return
    const slug = name.replace(/\s+/g, '_')
    const type = activeSite.value.type
    const term = type === 'e621' || type === 'derpibooru' ? `artist:${slug}` : slug
    query.value = query.value.trim() ? `${query.value.trim()} ${term}` : term
    closePost()
    void search(true)
  }

  async function openPost(post: BooruGalleryPost) {
    selectedPost.value = post
    selectedImage.value = post.fileUrl || post.sampleUrl || post.previewUrl
  }

  function closePost() {
    selectedPost.value = null
    selectedImage.value = ''
  }

  return {
    sites,
    activeSiteId,
    activeSite,
    query,
    rating,
    sort,
    rankingPeriod,
    posts,
    page,
    nextPage,
    ended,
    loading,
    error,
    selectedPost,
    selectedImage,
    settings,
    promptText,
    suggestions,
    relatedTags,
    searchHistory,
    favorites,
    loadSites,
    loadLocalData,
    addHistory,
    toggleFavorite,
    isFavorite,
    loadSettings,
    saveSettings,
    search,
    loadMore,
    fetchSuggestions,
    fetchRelatedTags,
    addTagToQuery,
    searchAuthor,
    openPost,
    closePost,
  }
})
