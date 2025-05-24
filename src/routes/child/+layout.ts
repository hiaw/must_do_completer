import { loadUserBasic } from "$lib/stores/userStore"

export const ssr = false // Important for client-side Appwrite calls in load

export async function load() {
  // Use lightweight loader for child routes - skips team syncing
  await loadUserBasic()
  return {}
}
