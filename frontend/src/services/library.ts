import axios from "axios";
import type { LibraryEntry } from "../stores/library";
export const libraryClient = axios.create({
  baseURL: import.meta.env?.VITE_API_URL ?? "http://localhost:3000/api",
  timeout: 20000,
});
const headers = (token: string) => ({ Authorization: "Bearer " + token });
export async function loadLibrary(token: string): Promise<LibraryEntry[]> {
  return (await libraryClient.get("/library", { headers: headers(token) })).data
    .data;
}
export async function addLibraryEntry(
  token: string,
  entry: LibraryEntry,
): Promise<LibraryEntry> {
  return (
    await libraryClient.put(
      "/library/" + encodeURIComponent(entry.game.slug),
      entry,
      { headers: headers(token) },
    )
  ).data.data;
}
export async function patchLibraryEntry(
  token: string,
  slug: string,
  patch: Partial<LibraryEntry>,
): Promise<LibraryEntry> {
  return (
    await libraryClient.patch("/library/" + encodeURIComponent(slug), patch, {
      headers: headers(token),
    })
  ).data.data;
}
export async function deleteLibraryEntry(token: string, slug: string) {
  await libraryClient.delete("/library/" + encodeURIComponent(slug), {
    headers: headers(token),
  });
}
export async function importLibraryEntries(
  token: string,
  entries: LibraryEntry[],
) {
  await libraryClient.post(
    "/library/import",
    { entries },
    { headers: headers(token) },
  );
}
