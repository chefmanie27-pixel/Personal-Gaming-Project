<script setup lang="ts">
import { ref } from "vue";
import { useAuthStore } from "../stores/auth";

defineEmits<{ close: [] }>();
const auth = useAuthStore();
const steamLogin =
  (import.meta.env.VITE_API_URL ?? "http://localhost:3000/api") + "/auth/steam";
const mode = ref<"login" | "register">("login");
const email = ref("");
const password = ref("");
const busy = ref(false);
const submit = async () => {
  busy.value = true;
  try {
    mode.value === "login"
      ? await auth.login(email.value, password.value)
      : await auth.register(email.value, password.value);
    (document.querySelector("[data-close-auth]") as HTMLButtonElement)?.click();
  } catch {
    /* message is rendered below */
  } finally {
    busy.value = false;
  }
};
</script>

<template>
  <div class="dialog-backdrop" @click.self="$emit('close')">
    <section class="auth-dialog">
      <button
        data-close-auth
        class="dialog-close"
        aria-label="Close"
        @click="$emit('close')"
      >
        ×
      </button>
      <p class="section-kicker">
        {{ mode === "login" ? "WELCOME BACK" : "JOIN THE VAULT" }}
      </p>
      <h2>
        {{ mode === "login" ? "Sign in to GameVault" : "Create your account" }}
      </h2>
      <p class="muted">Save games and track the prices that matter to you.</p>
      <a :href="steamLogin" class="button ghost full">Sign in with Steam</a>
      <form @submit.prevent="submit">
        <label
          >Email<input
            v-model="email"
            type="email"
            required
            autocomplete="email" /></label
        ><label
          >Password<input
            v-model="password"
            type="password"
            required
            minlength="8"
            autocomplete="current-password"
        /></label>
        <p v-if="auth.error" class="form-error">{{ auth.error }}</p>
        <button class="button primary full" :disabled="busy">
          {{
            busy
              ? "Working..."
              : mode === "login"
                ? "Sign in"
                : "Create account"
          }}
        </button>
      </form>
      <button
        class="switch-auth"
        @click="mode = mode === 'login' ? 'register' : 'login'"
      >
        {{
          mode === "login"
            ? "Need an account? Register"
            : "Already registered? Sign in"
        }}
      </button>
    </section>
  </div>
</template>
