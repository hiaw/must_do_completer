import { loadUser } from "$lib/stores/userStore"

export const ssr = false // Important for client-side Appwrite calls in load

export async function load() {
  // Check if user is already loaded to avoid redundant calls on client-side navigation
  // This simple check might need to be more sophisticated depending on userStore structure
  // if (get(userStore).currentUser === null && get(userStore).loading) {
  // For now, always attempt to load, userStore itself handles if already loaded or errors.
  await loadUser()
  // }
  return {} // Must return an object
}
