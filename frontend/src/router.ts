import { createRouter, createWebHistory } from 'vue-router'
import HomePage from './pages/HomePage.vue'
import CataloguePage from './pages/CataloguePage.vue'
import GameDetailsPage from './pages/GameDetailsPage.vue'
import DealsPage from './pages/DealsPage.vue'
import AdminPage from './pages/AdminPage.vue'
import AccountPage from './pages/AccountPage.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/catalogue', name: 'catalogue', component: CataloguePage },
    { path: '/games/:slug', name: 'game-details', component: GameDetailsPage },
    { path: '/deals', name: 'deals', component: DealsPage },
    { path: '/admin', name: 'admin', component: AdminPage },
    { path: '/account', name: 'account', component: AccountPage },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
