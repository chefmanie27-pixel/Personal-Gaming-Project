import axios from "axios";

export const alertsClient = axios.create({
  timeout: 20000,
  baseURL: import.meta.env?.VITE_API_URL ?? "http://localhost:3000/api",
});
export interface PriceAlert {
  id: string;
  target: string;
  currency: string;
  active: boolean;
  lastTriggered?: string;
  listing: {
    game: { slug: string; title: string; cover: string };
    store: { name: string };
    prices: Array<{
      amount: string;
      observedAt?: string;
      currency?: string;
      region?: string;
      sourceType?: string;
    }>;
  };
}
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
export async function fetchAlerts(token: string) {
  const { data } = await alertsClient.get<{ data: PriceAlert[] }>("/alerts", {
    headers: auth(token),
  });
  return data.data;
}
export async function createAlert(
  token: string,
  gameSlug: string,
  target: number,
) {
  const { data } = await alertsClient.post<{
    data: PriceAlert;
    existing?: boolean;
  }>("/alerts", { gameSlug, target }, { headers: auth(token) });
  return { ...data.data, existing: data.existing === true };
}
export async function updateAlert(token: string, id: string, active: boolean) {
  await alertsClient.patch(
    `/alerts/${id}`,
    { active },
    { headers: auth(token) },
  );
}
export async function deleteAlert(token: string, id: string) {
  await alertsClient.delete(`/alerts/${id}`, { headers: auth(token) });
}
