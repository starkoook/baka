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
      path: '/upscale',
      name: 'upscale',
      component: () => import('@/views/Upscale.vue'),
    },
    {
      path: '/gallery',
      name: 'gallery',
      component: () => import('@/views/TaggerV2.vue'),
    },
    {
      path: '/training',
      name: 'training',
      component: () => import('@/views/Training.vue'),
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

export default router
