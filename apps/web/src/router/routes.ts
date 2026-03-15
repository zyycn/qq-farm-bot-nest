import type { RouteRecordRaw } from 'vue-router'
import { ROUTE_NAMES, ROUTE_PATHS } from './constants'

const routes: RouteRecordRaw[] = [
  {
    path: ROUTE_PATHS.ROOT,
    component: () => import('@/layouts/index.vue'),
    children: [
      {
        path: '',
        name: ROUTE_NAMES.DASHBOARD,
        component: () => import('@/views/dashboard/index.vue'),
        meta: { label: '概览', icon: 'i-streamline-emojis-house-with-garden' }
      },
      {
        path: 'personal',
        name: 'personal',
        component: () => import('@/views/personal/index.vue'),
        meta: { label: '我的农场', icon: 'i-streamline-emojis-man-farmer-1' }
      },
      {
        path: 'friends',
        name: 'friends',
        component: () => import('@/views/friends/index.vue'),
        meta: { label: '好友列表', icon: 'i-streamline-emojis-man-and-woman-holding-hands-1' }
      },
      {
        path: 'analytics',
        name: 'analytics',
        component: () => import('@/views/analytics/index.vue'),
        meta: { label: '数据分析', icon: 'i-streamline-emojis-bar-chart' }
      },
      {
        path: 'almanac',
        name: 'almanac',
        component: () => import('@/views/almanac/index.vue'),
        meta: { label: '我的图鉴', icon: 'i-streamline-emojis-open-book' }
      },
      {
        path: 'warehouse',
        name: 'warehouse',
        component: () => import('@/views/warehouse/index.vue'),
        meta: { label: '我的仓库', icon: 'i-streamline-emojis-package' }
      },
      {
        path: 'shop',
        name: 'shop',
        component: () => import('@/views/shop/index.vue'),
        meta: { label: '种子商店', icon: 'i-streamline-emojis-seedling' }
      },
      {
        path: 'accounts',
        name: 'accounts',
        component: () => import('@/views/accounts/index.vue'),
        meta: { label: '账号管理', icon: 'i-streamline-emojis-bust-in-silhouette' }
      },
      {
        path: 'strategy',
        name: 'strategy',
        component: () => import('@/views/strategy/index.vue'),
        meta: { label: '策略设置', icon: 'i-streamline-emojis-direct-hit' }
      },
      {
        path: 'panel',
        name: 'panel',
        component: () => import('@/views/panel/index.vue'),
        meta: { label: '面板设置', icon: 'i-streamline-emojis-woman-mechanic-2' }
      }
    ]
  },
  {
    path: ROUTE_PATHS.LOGIN,
    name: ROUTE_NAMES.LOGIN,
    component: () => import('@/views/login/index.vue')
  }
]

export default routes
