import { loadUserBasic } from "$lib/stores/userStore"

export const ssr = false // Important for client-side Appwrite calls in load

export async function load() {
  // Use loadUserBasic for general page loads to skip unnecessary team syncing
  // Full loadUser() is only used when team syncing is specifically needed (e.g., family creation)
  await loadUserBasic()
  return {} // Must return an object
}
