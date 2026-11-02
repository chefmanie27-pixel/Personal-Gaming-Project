import { createRouter, createWebHistory } from "vue-router";
const HomePage = () => import("./pages/HomePage.vue");
const CataloguePage = () => import("./pages/CataloguePage.vue");
const GameDetailsPage = () => import("./pages/GameDetailsPage.vue");
const DealsPage = () => import("./pages/DealsPage.vue");
const SubscriptionsPage = () => import("./pages/SubscriptionsPage.vue");
const AdminPage = () => import("./pages/AdminPage.vue");
const AccountPage = () => import("./pages/AccountPage.vue");

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/backlog",
      name: "backlog",
      component: () => import("./pages/LibraryPage.vue"),
    },
    {
      path: "/collections",
      name: "collections",
      component: () => import("./pages/CollectionsPage.vue"),
    },
    {
      path: "/journal",
      name: "journal",
      component: () => import("./pages/JournalPage.vue"),
    },
    {
      path: "/compare",
      name: "compare",
      component: () => import("./pages/ComparePage.vue"),
    },
    {
      path: "/upcoming",
      name: "upcoming",
      component: () => import("./pages/UpcomingPage.vue"),
    },
    {
      path: "/play-next",
      name: "play-next",
      component: () => import("./pages/PlayNextPage.vue"),
    },
    {
      path: "/wrapped",
      name: "wrapped",
      component: () => import("./pages/WrappedPage.vue"),
    },
    {
      path: "/preferences",
      name: "preferences",
      component: () => import("./pages/PreferencesPage.vue"),
    },
    {
      path: "/library",
      name: "library",
      component: () => import("./pages/LibraryPage.vue"),
    },
    {
      path: "/favorites",
      name: "favorites",
      component: () => import("./pages/LibraryPage.vue"),
    },
    {
      path: "/dashboard",
      name: "dashboard",
      component: () => import("./pages/DashboardPage.vue"),
    },
    { path: "/", name: "home", component: HomePage },
    { path: "/catalogue", name: "catalogue", component: CataloguePage },
    { path: "/games/:slug", name: "game-details", component: GameDetailsPage },
    { path: "/deals", name: "deals", component: DealsPage },
    {
      path: "/subscriptions",
      name: "subscriptions",
      component: SubscriptionsPage,
    },
    { path: "/admin", name: "admin", component: AdminPage },
    { path: "/account", name: "account", component: AccountPage },
    {
      path: "/:pathMatch(.*)*",
      component: () => import("./pages/NotFoundPage.vue"),
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
