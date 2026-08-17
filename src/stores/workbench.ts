import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type WorkbenchRailTab = 'projects' | 'nodes' | 'assets' | 'settings'

export type WorkbenchAction =
  | 'run'
  | 'save'
  | 'open'
  | 'undo'
  | 'redo'
  | 'cancel'
  | 'run-node'
  | 'copy'
  | 'paste'
  | 'delete-selected'
  | 'save-node-content'
  | 'toggle-gen'

export interface WorkbenchActiveNode {
  id: number
  label: string
  kind: string
  genOpen?: boolean
  canSave: boolean
}

export const useWorkbenchStore = defineStore('workbench', () => {
  const railOpen = ref(false)
  const railTab = ref<WorkbenchRailTab>('projects')
  const reduceMotion = ref(
    typeof localStorage !== 'undefined' && localStorage.getItem('baka-workbench-reduce-motion') === '1',
  )
  const running = ref(false)
  const activeNode = ref<WorkbenchActiveNode | null>(null)
  const action = ref<WorkbenchAction | null>(null)

  watch(reduceMotion, (value) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('baka-workbench-reduce-motion', value ? '1' : '0')
    }
  })

  function toggleRail(tab: WorkbenchRailTab) {
    if (railOpen.value && railTab.value === tab) {
      railOpen.value = false
    } else {
      railTab.value = tab
      railOpen.value = true
    }
  }

  function setActiveNode(node: WorkbenchActiveNode | null) {
    activeNode.value = node
  }

  function setRunning(value: boolean) {
    running.value = value
  }

  function issueAction(name: WorkbenchAction) {
    action.value = name
  }

  return { railOpen, railTab, reduceMotion, running, activeNode, action, toggleRail, setActiveNode, setRunning, issueAction }
})
