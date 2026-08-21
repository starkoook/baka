import { useGalleryStore } from './gallery'

export async function setGallerySortMode(mode: string) {
  const galleryStore = useGalleryStore()
  galleryStore.sortMode = mode
  await galleryStore.loadImages(true)
  await galleryStore.fetchBatchTags(galleryStore.images.map((img) => img.id))
}
