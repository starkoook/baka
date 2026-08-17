import { createRouter, createWebHashHistory } from 'vue-router'
import { saveLastWorkspace } from '@/features/navigation/workspace-history'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/Dashboard.vue'),
    },
    {
      path: '/upscale',
      name: 'upscale',
      component: () => import('@/views/Upscale.vue'),
    },
    {
      path: '/workbench',
      name: 'workbench',
      component: () => import('@/views/Workbench.vue'),
    },
    {
      path: '/gallery',
      name: 'gallery',
      component: () => import('@/views/Gallery.vue'),
    },
    {
      path: '/booru-gallery',
      name: 'booruGallery',
      component: () => import('@/views/BooruGallery.vue'),
    },
    {
      path: '/tagger',
      name: 'tagger',
      component: () => import('@/views/Tagger.vue'),
    },
    {
      path: '/video',
      name: 'video',
      component: () => import('@/views/VideoTools.vue'),
    },
    {
      path: '/video/convert',
      name: 'videoConvert',
      component: () => import('@/views/VideoConvert.vue'),
    },
    {
      path: '/video/extract',
      name: 'videoExtract',
      component: () => import('@/views/VideoExtract.vue'),
    },
    {
      path: '/image-tools',
      name: 'imageTools',
      component: () => import('@/views/ImageTools.vue'),
    },
    {
      path: '/training',
      name: 'training',
      component: () => import('@/views/TrainingTask.vue'),
    },
    {
      path: '/training/runtime',
      name: 'trainingRuntime',
      component: () => import('@/views/Training.vue'),
    },
    {
      path: '/training/run',
      name: 'trainingRun',
      component: () => import('@/views/TrainingRun.vue'),
    },
    {
      path: '/reverse',
      name: 'reverse',
      component: () => import('@/views/Reverse.vue'),
    },
    {
      path: '/generate',
      name: 'generate',
      component: () => import('@/views/Generate.vue'),
    },
    {
      path: '/console',
      name: 'console',
      component: () => import('@/views/Console.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/Settings.vue'),
    },
  ],
})

router.afterEach((to) => saveLastWorkspace(to.path))

export default router
