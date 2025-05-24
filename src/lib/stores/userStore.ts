import { writable } from "svelte/store"
import { account, databases, teams } from "$lib/appwrite"
import { ID, Query } from "appwrite"

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

    // Attempt to get existing extended profile
    let extendedProfileDocId: string | undefined
    const existingProfilesResponse = await databases.listDocuments(
      DATABASE_ID,
      USERS_EXTENDED_COLLECTION_ID,
      [Query.equal("user_id", acc.$id), Query.limit(1)]
    )

    if (existingProfilesResponse.documents.length > 0) {
      const extendedData = existingProfilesResponse.documents[0]
      userProfile = {
        ...userProfile,
        name: extendedData.name || userProfile.name,
        role: extendedData.role as "parent" | "child",
        family_id: extendedData.family_id as string,
        $databaseId: extendedData.$id,
        $collectionId: extendedData.$collectionId,
      }
      extendedProfileDocId = extendedData.$id

      // If user is a child with complete profile data, skip team syncing
      if (userProfile.role === "child" && userProfile.family_id) {
        console.log(
          `[userStore] Child user ${acc.$id} loaded successfully, skipping team sync`
        )
        userStore.update((s) => ({
          ...s,
          currentUser: userProfile,
          loading: false,
        }))
        return
      }
    } else {
      // No existing extended profile, create a default one (role: parent, no family_id yet)
      console.log(
        `[userStore] No extended profile for ${acc.$id}. Creating one with role: 'parent'.`
      )
      const newExtendedProfileData = {
        user_id: acc.$id,
        role: "parent",
      }
      const newDocument = await databases.createDocument(
        DATABASE_ID,
        USERS_EXTENDED_COLLECTION_ID,
        ID.unique(),
        newExtendedProfileData
      )
      userProfile = {
        ...userProfile,
        role: "parent",
        family_id: undefined,
        $databaseId: newDocument.$id,
        $collectionId: newDocument.$collectionId,
      }
      extendedProfileDocId = newDocument.$id
      console.log(
        "[userStore] Created new extended profile document:",
        newDocument
      )
    }

    // Only perform team syncing for parents or users without complete profile data
    try {
      const teamList = await teams.list() // List teams the user is a member of
      if (teamList.teams.length > 0) {
        const primaryTeam = teamList.teams[0] // Assuming user is part of one family team for now

        // Correctly fetch the user's specific membership in this team
        const userMembershipsInTeam = await teams.listMemberships(
          primaryTeam.$id,
          [Query.equal("userId", acc.$id), Query.limit(1)]
        )

        if (userMembershipsInTeam.memberships.length > 0) {
          const membership = userMembershipsInTeam.memberships[0] // This is the user's specific membership object

          let teamRole: "parent" | "child" | undefined = undefined
          if (membership.roles.includes("owner")) teamRole = "parent"
          // Often 'owner' implies 'parent' in this context
          else if (membership.roles.includes("parent")) teamRole = "parent"
          else if (membership.roles.includes("child")) teamRole = "child"

          // Check if we need to sync name from team membership
          const teamMembershipName = membership.userName || null
          const needsNameSync = teamMembershipName && !userProfile.name

          if (
            teamRole &&
            (userProfile.family_id !== primaryTeam.$id ||
              userProfile.role !== teamRole ||
              needsNameSync)
          ) {
            console.log(
              `[userStore] Syncing team membership for ${acc.$id}. Team: ${primaryTeam.$id}, Role: ${teamRole}, Name: ${teamMembershipName}`
            )
            const updateData: {
              family_id: string
              role: "parent" | "child"
              name?: string
            } = {
              family_id: primaryTeam.$id,
              role: teamRole,
            }

            // Include name in update if we have one from team membership and user doesn't have a name yet
            if (teamMembershipName && !userProfile.name) {
              updateData.name = teamMembershipName
            }

            if (extendedProfileDocId) {
              await databases.updateDocument(
                DATABASE_ID,
                USERS_EXTENDED_COLLECTION_ID,
                extendedProfileDocId,
                updateData
              )
            } else {
              console.warn(
                "[userStore] Extended profile document ID was missing during team sync, attempting to create."
              )
              const newDocForTeam = await databases.createDocument(
                DATABASE_ID,
                USERS_EXTENDED_COLLECTION_ID,
                ID.unique(),
                {
                  user_id: acc.$id,
                  ...updateData,
                }
              )
              extendedProfileDocId = newDocForTeam.$id
            }
            userProfile.family_id = primaryTeam.$id
            userProfile.role = teamRole
            userProfile.$databaseId = extendedProfileDocId

            // Update the name in userProfile if we synced it
            if (updateData.name) {
              userProfile.name = updateData.name
            }
          }
        } else {
          console.warn(
            `[userStore] User ${acc.$id} is in team ${primaryTeam.name} (${primaryTeam.$id}) via teams.list(), but their specific membership details were not found via listMemberships.`
          )
        }
      }
    } catch (teamError) {
      console.warn("[userStore] Could not sync team memberships:", teamError)
      // Non-critical for basic profile loading, but user might not see family context
    }

    userStore.update((s) => ({
      ...s,
      currentUser: userProfile,
      loading: false,
    }))
  } catch (e: any) {
    if (
      e.message.includes("User (role: guest) missing scope (account)") ||
      e.message.includes("Session not found") ||
      e.type === "user_session_not_found" ||
      e.type === "general_unauthorized_scope"
    ) {
      userStore.update((s) => ({
        ...s,
        currentUser: null,
        loading: false,
        error: null,
      }))
    } else {
      console.error("[userStore] loadUser: A non-session error occurred:", e)
      userStore.update((s) => ({
        ...s,
        currentUser: null,
        loading: false,
        error: e.message,
      }))
    }
  }
}

// Lightweight version that skips team syncing - useful for child users
async function loadUserBasic() {
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

    // Get existing extended profile
    const existingProfilesResponse = await databases.listDocuments(
      DATABASE_ID,
      USERS_EXTENDED_COLLECTION_ID,
      [Query.equal("user_id", acc.$id), Query.limit(1)]
    )

    if (existingProfilesResponse.documents.length > 0) {
      const extendedData = existingProfilesResponse.documents[0]
      userProfile = {
        ...userProfile,
        name: extendedData.name || userProfile.name,
        role: extendedData.role as "parent" | "child",
        family_id: extendedData.family_id as string,
        $databaseId: extendedData.$id,
        $collectionId: extendedData.$collectionId,
      }
    } else {
      // Create basic profile for new users
      const newExtendedProfileData = {
        user_id: acc.$id,
        role: "parent", // Default role
      }
      const newDocument = await databases.createDocument(
        DATABASE_ID,
        USERS_EXTENDED_COLLECTION_ID,
        ID.unique(),
        newExtendedProfileData
      )
      userProfile = {
        ...userProfile,
        role: "parent",
        family_id: undefined,
        $databaseId: newDocument.$id,
        $collectionId: newDocument.$collectionId,
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
      e.message.includes("Session not found") ||
      e.type === "user_session_not_found" ||
      e.type === "general_unauthorized_scope"
    ) {
      userStore.update((s) => ({
        ...s,
        currentUser: null,
        loading: false,
        error: null,
      }))
    } else {
      console.error(
        "[userStore] loadUserBasic: A non-session error occurred:",
        e
      )
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
    userStore.set({ ...initialState, loading: false })
  } catch (e: any) {
    console.error("Error during logout:", e)
    userStore.update((s) => ({ ...s, error: e.message, loading: false }))
  }
}

export { userStore, loadUser, loadUserBasic, logout }
