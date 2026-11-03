import { defineStore } from "pinia";
import { ref } from "vue";
import axios from "axios";
import { useAuthStore } from "./auth";
export interface SocialSettings {
  accent: "violet" | "cyan" | "rose" | "amber";
  density: "comfortable" | "compact";
  reducedMotion: boolean;
  showRecommendations: boolean;
  showStats: boolean;
  notifications: boolean;
  dashboardWidgets?: Array<"stats" | "status" | "genres" | "ratings">;
  homeSections?: Array<"popular" | "rated" | "recent" | "upcoming" | "more">;
}
export interface SocialProfile {
  userId: string;
  username: string;
  name: string;
  bio: string;
  avatar: string;
  banner: string;
  visibility: "public" | "private";
  shareLibrary: boolean;
  version: number;
  settings: SocialSettings;
}
export interface UserCard {
  userId: string;
  username: string;
  name: string;
  avatar: string;
  visibility: string;
}
export interface PublicGame {
  id: string;
  slug: string;
  title: string;
  cover: string;
  genres: string[];
  platforms: string[];
}
export interface CommunityReview {
  id: string;
  userId: string;
  slug: string;
  game: PublicGame;
  title: string;
  body: string;
  rating: number;
  spoiler: boolean;
  version: number;
  createdAt: string;
  author: UserCard;
  likes: number;
  liked: boolean;
}
export interface Publication {
  id: string;
  userId: string;
  name: string;
  description: string;
  cover: string;
  theme: string;
  visibility: "public" | "private";
  games: PublicGame[];
  version: number;
  author?: UserCard;
  followers?: number;
  followed?: boolean;
  permission?: "owner" | "editor" | "viewer";
  featured?: boolean;
}
export const defaults = (): SocialSettings => ({
  accent: "violet",
  density: "comfortable",
  reducedMotion: false,
  showRecommendations: true,
  showStats: true,
  notifications: true,
  dashboardWidgets: ["stats", "status", "genres", "ratings"],
  homeSections: ["popular", "rated", "recent", "upcoming", "more"],
});
export const socialClient = axios.create({
  baseURL: import.meta.env?.VITE_API_URL ?? "http://localhost:3000/api",
  timeout: 60000,
});
export function socialMessage(e: unknown) {
  return axios.isAxiosError(e)
    ? (e.response?.data?.error ??
        "Unable to reach the community server. Please retry.")
    : e instanceof Error
      ? e.message
      : "Action failed. Please retry.";
}
export const useSocialStore = defineStore("social", () => {
  const auth = useAuthStore(),
    me = ref<SocialProfile | null>(null),
    ready = ref(false),
    unread = ref(0);
  let generation = 0;
  async function request<T = any>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const token = auth.token,
      current = generation;
    const r = await socialClient.request<T>({
      url: path,
      method,
      data: body,
      headers: token ? { Authorization: "Bearer " + token } : {},
    });
    if (current !== generation || auth.token !== token)
      throw new Error("Your session changed. Reload this page.");
    return r.data;
  }
  async function connect() {
    generation++;
    me.value = null;
    unread.value = 0;
    ready.value = false;
    if (!auth.user || !auth.token) {
      ready.value = true;
      return;
    }
    const current = generation;
    try {
      const r = await request<{ data: SocialProfile | null }>("/social/me");
      if (current === generation) me.value = r.data;
    } catch {
    } finally {
      if (current === generation) ready.value = true;
    }
  }
  async function poll() {
    if (!auth.user || document.hidden) return;
    try {
      unread.value = (await request("/social/notifications?limit=1")).unread;
    } catch {}
  }
  return { me, ready, unread, request, connect, poll };
});
export function publicGame(g: PublicGame): PublicGame {
  return {
    id: g.id,
    slug: g.slug,
    title: g.title,
    cover: g.cover,
    genres: g.genres,
    platforms: g.platforms,
  };
}
