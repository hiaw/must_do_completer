import { writable } from "svelte/store"
import { account, databases } from "$lib/appwrite"
import { Query } from "appwrite"

// Define these in your .env or directly if they are fixed
const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || "must_dos_db"
const USERS_EXTENDED_COLLECTION_ID =
  import.meta.env.VITE_APPWRITE_USERS_EXTENDED_COLLECTION_ID || "users_extended"

export interface UserProfile {
  $id: string // Appwrite User ID
  name: string
  email: string
  prefs: Record<string, any>
  // Fields from users_extended
  role?: "parent" | "child"
  family_id?: string // This will be the Appwrite Team ID for the family
  $databaseId?: string // Document ID from users_extended
  $collectionId?: string // Collection ID from users_extended
}

export interface AppwriteUserStoreState {
  currentUser: UserProfile | null
  loading: boolean
  error: string | null
}

const initialState: AppwriteUserStoreState = {
  currentUser: null,
  loading: true,
  error: null,
}

const userStore = writable<AppwriteUserStoreState>(initialState)

async function loadUser() {
  try {
    userStore.update((s) => ({ ...s, loading: true, error: null }))
    const acc = await account.get()

    let userProfile: UserProfile = {
      $id: acc.$id,
      name: acc.name,
      email: acc.email,
      prefs: acc.prefs as Record<string, any>,
    }

    if (!DATABASE_ID || !USERS_EXTENDED_COLLECTION_ID) {
      throw new Error(
        "Database ID or Users Extended Collection ID is not configured."
      )
    }

    const response = await databases.listDocuments(
      DATABASE_ID,
      USERS_EXTENDED_COLLECTION_ID,
      [Query.equal("user_id", acc.$id), Query.limit(1)]
    )

    if (response.documents.length > 0) {
      const extendedData = response.documents[0]
      userProfile = {
        ...userProfile,
        role: extendedData.role as "parent" | "child",
        family_id: extendedData.family_id as string,
        $databaseId: extendedData.$databaseId,
        $collectionId: extendedData.$collectionId,
      }
    }

    userStore.update((s) => ({
      ...s,
      currentUser: userProfile,
      loading: false,
    }))
  } catch (e: any) {
    if (
      e.message.includes("User (role: guest) missing scope (account)") ||
      e.message.includes("Session not found")
    ) {
      userStore.update((s) => ({
        ...s,
        currentUser: null,
        loading: false,
        error: null,
      }))
    } else {
      console.error("Error loading user:", e)
      userStore.update((s) => ({
        ...s,
        currentUser: null,
        loading: false,
        error: e.message,
      }))
    }
  }
}

async function logout() {
  try {
    await account.deleteSession("current")
    userStore.set({ ...initialState, loading: false }) // Reset but indicate loading is done
  } catch (e: any) {
    console.error("Error during logout:", e)
    userStore.update((s) => ({ ...s, error: e.message, loading: false }))
  }
}

export { userStore, loadUser, logout }
