import { defineStore } from "pinia";
import { ref } from "vue";
import axios from "axios";

export const authClient = axios.create({
  timeout: 20000,
  baseURL: import.meta.env?.VITE_API_URL ?? "http://localhost:3000/api",
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
  let generation = 0;
  function cancelPending() {
    generation++;
  }
  async function authenticate(
    path: "login" | "register",
    email: string,
    password: string,
  ) {
    const current = ++generation,
      previousToken = token.value;
    const active = () =>
      current === generation && token.value === previousToken;
    error.value = "";
    try {
      const response = await authClient.post<{
        data: { user: User; token: string };
      }>("/auth/" + path, { email, password });
      if (!active()) throw new Error("Your sign-in changed. Please retry.");
      localStorage.setItem("gamevault_token", response.data.data.token);
      token.value = response.data.data.token;
      user.value = response.data.data.user;
    } catch (reason) {
      if (active())
        error.value = axios.isAxiosError(reason)
          ? (reason.response?.data?.error ??
            (path === "login" ? "Unable to sign in" : "Unable to register"))
          : path === "login"
            ? "Unable to sign in"
            : "Unable to register";
      throw reason;
    }
  }
  function login(email: string, password: string) {
    return authenticate("login", email, password);
  }
  function register(email: string, password: string) {
    return authenticate("register", email, password);
  }
  async function restore() {
    const current = ++generation;
    let expectedToken = token.value;
    const active = () =>
      current === generation && token.value === expectedToken;
    error.value = "";
    const fragment = new URLSearchParams(location.hash.slice(1));
    if (fragment.has("steam_error")) {
      error.value = "Steam sign-in failed. Please retry.";
      history.replaceState(null, "", location.pathname + location.search);
    }
    const code = fragment.get("steam_code");
    if (code) {
      history.replaceState(null, "", location.pathname + location.search);
      try {
        const result = await authClient.post("/auth/steam/exchange", { code });
        if (!active()) return;
        localStorage.setItem("gamevault_token", result.data.data.token);
        expectedToken = result.data.data.token;
        token.value = expectedToken;
        user.value = null;
      } catch {
        if (!active()) return;
        error.value = "Steam sign-in expired. Please retry.";
      }
    }
    if (!active() || !expectedToken) return;
    try {
      const response = await authClient.get("/auth/me", {
        headers: { Authorization: "Bearer " + expectedToken },
      });
      if (active()) user.value = response.data.data;
    } catch (reason) {
      if (!active()) return;
      if (axios.isAxiosError(reason) && reason.response?.status === 401)
        logout();
      else
        error.value =
          "Unable to verify your sign-in. Retry the sign-in check or sign out to use the device collection.";
    }
  }
  function logout() {
    cancelPending();
    token.value = null;
    user.value = null;
    error.value = "";
    localStorage.removeItem("gamevault_token");
  }
  async function addWishlist(gameSlug: string, target?: number) {
    if (!token.value) throw new Error("Sign in to save games");
    await authClient.post(
      "/wishlist",
      { gameSlug, target },
      { headers: { Authorization: `Bearer ${token.value}` } },
    );
  }
  return {
    token,
    user,
    error,
    login,
    register,
    logout,
    addWishlist,
    restore,
    cancelPending,
  };
});
