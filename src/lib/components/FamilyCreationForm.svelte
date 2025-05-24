<script lang="ts">
  import { createEventDispatcher } from "svelte"
  import { userStore, loadUser } from "$lib/stores/userStore"
  import { teams, databases } from "$lib/appwrite"
  import { ID } from "appwrite"

  const dispatch = createEventDispatcher()

  // Constants
  const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || "must_dos_db"
  const USERS_EXTENDED_COLLECTION_ID =
    import.meta.env.VITE_APPWRITE_USERS_EXTENDED_COLLECTION_ID ||
    "users_extended"

  let familyName = ""
  let isCreatingFamily = false
  let createFamilyError: string | null = null

  async function handleSubmit() {
    if (!familyName.trim()) {
      createFamilyError = "Family name is required."
      return
    }

    const currentUser = $userStore.currentUser
    if (!currentUser || !currentUser.$id || !currentUser.$databaseId) {
      createFamilyError =
        "Current user data is incomplete. Cannot create family."
      return
    }

    isCreatingFamily = true
    createFamilyError = null

    try {
      const newTeam = await teams.create(ID.unique(), familyName.trim(), [
        "owner",
        "parent",
      ])

      await databases.updateDocument(
        DATABASE_ID,
        USERS_EXTENDED_COLLECTION_ID,
        currentUser.$databaseId,
        { family_id: newTeam.$id },
      )

      await loadUser()

      // Notify parent component of successful creation
      dispatch("familyCreated", {
        familyId: newTeam.$id,
        familyName: familyName.trim(),
      })

      // Reset form
      familyName = ""
    } catch (err: any) {
      console.error("Failed to create family:", err)
      createFamilyError =
        err.message || "An unknown error occurred while creating the family."
    } finally {
      isCreatingFamily = false
    }
  }
</script>

<section class="bg-gray-50 border border-gray-300 rounded-lg p-8 text-center">
  <h2 class="text-2xl font-semibold text-gray-800 mb-4">
    Create Your Family Group
  </h2>
  <p class="text-gray-600 mb-8">
    To start managing tasks, you need to create a family group.
  </p>
  <form on:submit|preventDefault={handleSubmit} class="max-w-md mx-auto">
    <div class="mb-4 text-left">
      <label for="familyName" class="block mb-2 font-bold text-gray-700">
        Family Name:
      </label>
      <input
        type="text"
        id="familyName"
        bind:value={familyName}
        required
        disabled={isCreatingFamily}
        class="w-full px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
    </div>
    <button
      type="submit"
      disabled={isCreatingFamily}
      class="w-full px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
    >
      {#if isCreatingFamily}Creating...{:else}Create Family{/if}
    </button>
    {#if createFamilyError}
      <p class="text-red-600 text-sm mt-2">{createFamilyError}</p>
    {/if}
  </form>
</section>
