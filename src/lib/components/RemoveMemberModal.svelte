<script lang="ts">
  import { createEventDispatcher } from "svelte"
  import type { UserProfile } from "$lib/stores/userStore"
  import { userStore } from "$lib/stores/userStore"
  import { teams, databases } from "$lib/appwrite"

  const dispatch = createEventDispatcher()

  // Constants
  const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || "must_dos_db"
  const USERS_EXTENDED_COLLECTION_ID =
    import.meta.env.VITE_APPWRITE_USERS_EXTENDED_COLLECTION_ID ||
    "users_extended"

  export let memberToRemove: UserProfile | null = null

  let isRemovingMember = false
  let removeMemberError: string | null = null

  function handleCancel() {
    memberToRemove = null
    removeMemberError = null
    dispatch("cancel")
  }

  async function handleConfirm() {
    if (!memberToRemove || !$userStore.currentUser?.family_id) {
      removeMemberError = "Invalid member or family context."
      return
    }

    if (memberToRemove.$id === $userStore.currentUser.$id) {
      removeMemberError = "You cannot remove yourself from the family."
      return
    }

    isRemovingMember = true
    removeMemberError = null

    try {
      const memberships = await teams.listMemberships(
        $userStore.currentUser.family_id,
      )
      const membershipToRemove = memberships.memberships.find(
        (m) => m.userId === memberToRemove!.$id,
      )

      if (!membershipToRemove) {
        throw new Error("Membership not found for this user.")
      }

      await teams.deleteMembership(
        $userStore.currentUser.family_id,
        membershipToRemove.$id,
      )

      if (memberToRemove && memberToRemove.$databaseId) {
        try {
          await databases.updateDocument(
            DATABASE_ID,
            USERS_EXTENDED_COLLECTION_ID,
            memberToRemove.$databaseId,
            { family_id: null },
          )
        } catch (updateError) {
          console.warn("Failed to update users_extended document:", updateError)
        }
      }

      // Notify parent component of successful removal
      dispatch("memberRemoved", {
        removedMember: memberToRemove,
        membershipId: membershipToRemove.$id,
      })

      // Reset state
      memberToRemove = null
      removeMemberError = null
    } catch (err: any) {
      console.error("Failed to remove family member:", err)
      removeMemberError =
        err.message ||
        "An unknown error occurred while removing the family member."
    } finally {
      isRemovingMember = false
    }
  }
</script>

{#if memberToRemove}
  <div
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
  >
    <div class="bg-white rounded-lg p-8 max-w-md w-full mx-4">
      <h3 class="text-xl font-bold text-gray-800 mb-4">Remove Family Member</h3>
      <p class="text-gray-700 mb-6">
        Are you sure you want to remove <strong
          >{memberToRemove.name || memberToRemove.email}</strong
        >
        from your family? This action cannot be undone and they will lose access
        to all family tasks.
      </p>

      {#if removeMemberError}
        <p class="text-red-600 text-sm mb-4">{removeMemberError}</p>
      {/if}

      <div class="flex gap-4 justify-end">
        <button
          type="button"
          on:click={handleCancel}
          disabled={isRemovingMember}
          class="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          on:click={handleConfirm}
          disabled={isRemovingMember}
          class="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {#if isRemovingMember}Removing...{:else}Remove Member{/if}
        </button>
      </div>
    </div>
  </div>
{/if}
