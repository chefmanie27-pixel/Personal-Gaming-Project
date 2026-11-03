<script setup lang="ts">
import { ref } from "vue";
import { useAuthStore } from "../stores/auth";
import { socialClient, socialMessage } from "../stores/social";
const props = defineProps<{ label: string }>(),
  emit = defineEmits<{ uploaded: [url: string] }>(),
  auth = useAuthStore(),
  busy = ref(false),
  error = ref("");
async function upload(event: Event) {
  const el = event.target as HTMLInputElement,
    file = el.files?.[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    error.value = "Choose an image up to 2 MiB.";
    return;
  }
  const token = auth.token;
  busy.value = true;
  error.value = "";
  try {
    const r = await socialClient.post("/artwork", file, {
      headers: { Authorization: "Bearer " + token, "Content-Type": file.type },
    });
    if (auth.token === token) emit("uploaded", r.data.data.url);
  } catch (e) {
    if (auth.token === token) error.value = socialMessage(e);
  } finally {
    busy.value = false;
    el.value = "";
  }
}
</script>
<template>
  <div>
    <label
      >{{ props.label
      }}<input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        :disabled="busy || !auth.user"
        @change="upload" /></label
    ><small
      >PNG, JPEG or WebP, up to 2 MiB. Uploaded artwork is public by URL; do not
      upload private images.</small
    >
    <p v-if="busy" role="status">Processing image...</p>
    <p v-if="error" role="alert" class="form-error">{{ error }}</p>
  </div>
</template>
