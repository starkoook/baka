import { defineStore } from "pinia"
import { computed, ref } from "vue"
import { filesToFrames, sliceSheet, type SeqFrame } from "@/lib/sequence"
import { createDemoWalkFrames, createDemoWalkSheetDataUrl, DEMO_SHEET_COLS, DEMO_SHEET_ROWS } from "@/lib/demo-frames"

export const useSequenceStore = defineStore("sequence", () => {
  const frames = ref<SeqFrame[]>([])
  const index = ref(0)
  const playing = ref(false)
  const fps = ref(8)
  const loop = ref(true)
  const onion = ref(true)

  const current = computed(() => frames.value[index.value] || null)
  const count = computed(() => frames.value.length)

  function clampIndex() {
    if (!frames.value.length) {
      index.value = 0
      playing.value = false
      return
    }
    if (index.value >= frames.value.length) index.value = frames.value.length - 1
    if (index.value < 0) index.value = 0
  }

  function setFrames(next: SeqFrame[], autoplay = false) {
    frames.value = next
    index.value = 0
    playing.value = autoplay && next.length > 0
    clampIndex()
  }

  function appendFrames(next: SeqFrame[]) {
    if (!next.length) return
    frames.value = frames.value.concat(next)
    if (frames.value.length === next.length) index.value = 0
  }

  async function importFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    appendFrames(await filesToFrames(files))
  }

  async function sliceAndReplace(src: string, cols: number, rows: number, padding = 0, margin = 0) {
    const next = await sliceSheet(src, cols, rows, padding, margin)
    setFrames(next, true)
    return next
  }

  async function loadDemoSheet() {
    return sliceAndReplace(createDemoWalkSheetDataUrl(), DEMO_SHEET_COLS, DEMO_SHEET_ROWS)
  }

  function loadDemoCycle() {
    setFrames(createDemoWalkFrames(), true)
  }

  function select(i: number) {
    if (i < 0 || i >= frames.value.length) return
    index.value = i
  }

  function step(delta: number) {
    if (!frames.value.length) return
    if (loop.value) {
      index.value = (index.value + delta + frames.value.length) % frames.value.length
      return
    }
    const next = index.value + delta
    if (next < 0) index.value = 0
    else if (next >= frames.value.length) {
      index.value = frames.value.length - 1
      playing.value = false
    } else index.value = next
  }

  function play() { if (frames.value.length) playing.value = true }
  function pause() { playing.value = false }
  function togglePlay() { playing.value ? pause() : play() }

  function removeAt(i: number) {
    frames.value = frames.value.filter((_, idx) => idx !== i)
    clampIndex()
  }

  function clear() {
    frames.value = []
    index.value = 0
    playing.value = false
  }

  function moveFrame(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= frames.value.length || to > frames.value.length) return
    const next = frames.value.slice()
    const [item] = next.splice(from, 1)
    const dest = from < to ? to - 1 : to
    next.splice(dest, 0, item)
    const currentId = current.value?.id
    frames.value = next
    if (currentId) {
      const ni = next.findIndex((f) => f.id === currentId)
      if (ni >= 0) index.value = ni
    }
  }

  return {
    frames, index, playing, fps, loop, onion, current, count,
    setFrames, appendFrames, importFiles, sliceAndReplace, loadDemoSheet, loadDemoCycle,
    select, step, play, pause, togglePlay, removeAt, clear, moveFrame,
  }
})
