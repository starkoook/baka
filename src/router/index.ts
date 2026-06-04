import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/Dashboard.vue'),
    },
    {
      path: '/tagger',
      name: 'tagger',
      component: () => import('@/views/Tagger.vue'),
    },
    {
      path: '/upscale',
      name: 'upscale',
      component: () => import('@/views/Upscale.vue'),
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
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/Settings.vue'),
    },
  ],
})

export default router
