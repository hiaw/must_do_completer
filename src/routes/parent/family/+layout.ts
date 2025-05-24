import { loadUser } from "$lib/stores/userStore"

export const ssr = false // Important for client-side Appwrite calls in load

export async function load() {
  // Use full loader for family management - needs team syncing
  await loadUser()
  return {}
}
