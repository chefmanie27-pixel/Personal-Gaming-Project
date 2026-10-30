import { defineStore } from "pinia";
import { ref } from "vue";
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3000/api",
});
interface User {
  id: string;
  email: string;
  role: string;
}

export const useAuthStore = defineStore("auth", () => {
  const token = ref(localStorage.getItem("gamevault_token"));
  const user = ref<User | null>(null);
  const error = ref("");
  async function login(email: string, password: string) {
    error.value = "";
    try {
      const response = await api.post<{ data: { user: User; token: string } }>(
        "/auth/login",
        { email, password },
      );
      token.value = response.data.data.token;
      user.value = response.data.data.user;
      localStorage.setItem("gamevault_token", token.value);
    } catch (reason) {
      error.value = axios.isAxiosError(reason)
        ? (reason.response?.data?.error ?? "Unable to sign in")
        : "Unable to sign in";
      throw reason;
    }
  }
  async function register(email: string, password: string) {
    error.value = "";
    try {
      const response = await api.post<{ data: { user: User; token: string } }>(
        "/auth/register",
        { email, password },
      );
      token.value = response.data.data.token;
      user.value = response.data.data.user;
      localStorage.setItem("gamevault_token", token.value);
    } catch (reason) {
      error.value = axios.isAxiosError(reason)
        ? (reason.response?.data?.error ?? "Unable to register")
        : "Unable to register";
      throw reason;
    }
  }
  async function restore() {
    const fragment = new URLSearchParams(location.hash.slice(1));
    if (fragment.has("steam_error")) {
      error.value = "Steam sign-in failed. Please retry.";
      history.replaceState(null, "", location.pathname + location.search);
    }
    const code = fragment.get("steam_code");
    if (code) {
      history.replaceState(null, "", location.pathname + location.search);
      try {
        const result = await api.post("/auth/steam/exchange", { code });
        token.value = result.data.data.token;
        localStorage.setItem("gamevault_token", token.value!);
      } catch {
        error.value = "Steam sign-in expired. Please retry.";
      }
    }
    if (token.value)
      try {
        user.value = (
          await api.get("/auth/me", {
            headers: { Authorization: "Bearer " + token.value },
          })
        ).data.data;
      } catch (reason) {
        if (axios.isAxiosError(reason) && reason.response?.status === 401)
          logout();
      }
  }
  function logout() {
    token.value = null;
    user.value = null;
    localStorage.removeItem("gamevault_token");
  }
  async function addWishlist(gameSlug: string, target?: number) {
    if (!token.value) throw new Error("Sign in to save games");
    await api.post(
      "/wishlist",
      { gameSlug, target },
      { headers: { Authorization: `Bearer ${token.value}` } },
    );
  }
  return { token, user, error, login, register, logout, addWishlist, restore };
});
