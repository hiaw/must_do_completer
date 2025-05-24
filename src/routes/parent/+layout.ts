import { loadUserBasic } from "$lib/stores/userStore"

export const ssr = false // Important for client-side Appwrite calls in load

export async function load() {
  // Use lightweight loader for parent routes - skips team syncing
  // Team syncing is only needed on the family management page
  await loadUserBasic()
  return {}
}
