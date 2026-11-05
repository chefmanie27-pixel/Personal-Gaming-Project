import { ref, computed, watch, onScopeDispose, type Ref } from "vue";
import axios from "axios";
import type { Game } from "../types";
import { useAuthStore } from "../stores/auth";
import { socialClient, socialMessage } from "../stores/social";
import { alertTargetError } from "../utils/alertTarget";
import { createAlert } from "../services/alerts";
import { createOperationScope } from "../utils/requestScope";

export function useGameActions(game: Ref<Game | undefined>, routeSlug: () => string) {
  const auth = useAuthStore();
  const wishlistMessage = ref(""), wishlistBusy = ref(false);
  const targetPrice = ref<number>(), savingAlert = ref(false), alertMessage = ref("");
  const targetTouched = ref(false), targetBadInput = ref(false), targetControlRevision = ref(0);
  const targetError = computed(() => targetTouched.value || targetPrice.value !== undefined || targetBadInput.value ? alertTargetError(targetPrice.value, targetBadInput.value) : "");
  function trackTarget(event: Event) {
    targetBadInput.value = (event.target as HTMLInputElement).validity.badInput;
    alertMessage.value = "";
  }
  const observationMessage = ref(""), observing = ref(false), historyRevision = ref(0);
  const context = () => [auth.token, auth.user?.id, routeSlug(), game.value?.slug];
  const wishlistScope = createOperationScope(context), alertScope = createOperationScope(context), observationScope = createOperationScope(context);
  function reset() {
    wishlistScope.invalidate(); alertScope.invalidate(); observationScope.invalidate();
    wishlistMessage.value = ""; alertMessage.value = ""; observationMessage.value = "";
    wishlistBusy.value = false; savingAlert.value = false; observing.value = false;
    targetPrice.value = undefined;
    targetTouched.value = false; targetBadInput.value = false; targetControlRevision.value++;
  }
  watch(context, reset, { flush: "sync" });
  onScopeDispose(() => {
    reset(); wishlistScope.dispose(); alertScope.dispose(); observationScope.dispose();
  });
  async function ensureCanonical(token: string, slug: string) {
    if (/^(rawg|playstation)-/.test(slug)) return;
    try {
      await socialClient.post("/games/" + slug + "/observe", {}, { headers: { Authorization: "Bearer " + token } });
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 409) throw e;
    }
  }
  async function saveObservation() {
    if (observing.value) return;
    const token = auth.token, slug = game.value?.slug;
    if (!token || !slug) { observationMessage.value = "Sign in to save a source-backed observation."; return; }
    const current = observationScope.next();
    observing.value = true; observationMessage.value = "";
    try {
      const r = await socialClient.post("/games/" + slug + "/observe", {}, { headers: { Authorization: "Bearer " + token } });
      if (!current()) return;
      observationMessage.value = r.data.data.priceAvailable
        ? r.data.data.recorded ? "Regional store observation saved." : "This cached observation is already stored."
        : "Game metadata saved, but its current price is missing or stale; no price observation was created.";
      historyRevision.value++;
    } catch (e) { if (current()) observationMessage.value = socialMessage(e); }
    finally { if (current()) observing.value = false; }
  }
  async function saveToWishlist() {
    if (wishlistBusy.value) return;
    const token = auth.token, slug = game.value?.slug;
    wishlistMessage.value = "";
    if (!token || !slug) { wishlistMessage.value = "Sign in to save games."; return; }
    const current = wishlistScope.next(); wishlistBusy.value = true;
    try {
      await ensureCanonical(token, slug);
      if (!current()) return;
      await auth.addWishlist(slug);
      if (current()) wishlistMessage.value = "Saved to your wishlist.";
    } catch { if (current()) wishlistMessage.value = "Could not save this game yet."; }
    finally { if (current()) wishlistBusy.value = false; }
  }
  async function setPriceAlert() {
    if (savingAlert.value) return;
    alertMessage.value = "";
    const token = auth.token, slug = game.value?.slug, target = targetPrice.value;
    targetTouched.value = true;
    if (targetError.value || typeof target !== "number") return;
    if (!token || !slug) { alertMessage.value = "Sign in to save price alerts."; return; }
    const current = alertScope.next(); savingAlert.value = true;
    try {
      await ensureCanonical(token, slug);
      if (!current()) return;
      const result = await createAlert(token, slug, target);
      if (!current()) return;
      alertMessage.value = result.existing
        ? result.active ? "This price alert is already saved." : "This alert already exists and is paused. Resume it in your account."
        : "Price alert saved.";
    } catch (e) { if (current()) alertMessage.value = socialMessage(e); }
    finally { if (current()) savingAlert.value = false; }
  }
  return { targetError, targetControlRevision, trackTarget, wishlistMessage, wishlistBusy, targetPrice, savingAlert, alertMessage, observationMessage, observing, historyRevision, saveObservation, saveToWishlist, setPriceAlert };
}
