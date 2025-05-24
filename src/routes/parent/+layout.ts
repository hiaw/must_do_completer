export const ssr = false // Important for client-side Appwrite calls in load

export async function load() {
  // User loading is already handled by the root layout
  // No need to duplicate the call here
  return {}
}
