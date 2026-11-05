import { ref, watch, onScopeDispose } from "vue";
import { useAuthStore } from "../stores/auth";
import {
  fetchAlerts,
  updateAlert,
  deleteAlert,
  type PriceAlert,
} from "../services/alerts";
import { socialMessage } from "../stores/social";
export function usePriceAlerts() {
  const auth = useAuthStore();
  const alerts = ref<PriceAlert[]>([]),
    busy = ref(false),
    loading = ref(false),
    error = ref(""),
    notice = ref("");
  let generation = 0,
    disposed = false;
  function context() {
    const token = auth.token,
      id = auth.user?.id,
      operation = ++generation;
    return {
      token,
      id,
      current: () =>
        !disposed &&
        operation === generation &&
        auth.token === token &&
        auth.user?.id === id,
    };
  }
  async function load() {
    const c = context();
    alerts.value = [];
    busy.value = false;
    loading.value = false;
    error.value = "";
    notice.value = "";
    if (disposed || !c.token || !c.id) return;
    busy.value = true;
    loading.value = true;
    try {
      const rows = await fetchAlerts(c.token);
      if (c.current()) alerts.value = rows;
    } catch (e) {
      if (c.current()) error.value = socialMessage(e);
    } finally {
      if (c.current()) {
        busy.value = false;
        loading.value = false;
      }
    }
  }
  async function mutate(
    alert: PriceAlert,
    request: (token: string) => Promise<void>,
    apply: () => void,
    message: string,
  ) {
    if (
      disposed ||
      busy.value ||
      !auth.token ||
      !auth.user ||
      !alerts.value.some((a) => a.id === alert.id)
    )
      return false;
    const c = context();
    busy.value = true;
    error.value = "";
    notice.value = "";
    try {
      await request(c.token!);
      if (!c.current()) return false;
      apply();
      notice.value = message;
      return true;
    } catch (e) {
      if (c.current()) error.value = socialMessage(e);
      return false;
    } finally {
      if (c.current()) busy.value = false;
    }
  }
  function toggle(alert: PriceAlert) {
    const active = !alert.active;
    return mutate(
      alert,
      (token) => updateAlert(token, alert.id, active),
      () => {
        const row = alerts.value.find((a) => a.id === alert.id);
        if (row) row.active = active;
      },
      active ? "Alert resumed." : "Alert paused.",
    );
  }
  function remove(alert: PriceAlert) {
    return mutate(
      alert,
      (token) => deleteAlert(token, alert.id),
      () => {
        alerts.value = alerts.value.filter((a) => a.id !== alert.id);
      },
      "Price alert removed.",
    );
  }
  watch(
    () => [auth.user?.id, auth.token],
    () => void load(),
    { immediate: true },
  );
  onScopeDispose(() => {
    disposed = true;
    generation++;
    alerts.value = [];
    busy.value = false;
    loading.value = false;
  });
  return { alerts, busy, loading, error, notice, load, toggle, remove };
}
