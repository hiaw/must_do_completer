<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte"
  import type { UserProfile } from "$lib/stores/userStore"
  import { userStore } from "$lib/stores/userStore"
  import { databases, account } from "$lib/appwrite"
  import { Query } from "appwrite"

  const dispatch = createEventDispatcher()

  // Constants
  const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || "must_dos_db"
  const USERS_EXTENDED_COLLECTION_ID =
    import.meta.env.VITE_APPWRITE_USERS_EXTENDED_COLLECTION_ID ||
    "users_extended"

  export let selectedMember: UserProfile | null = null
  export let currentUserId: string | undefined = undefined

  let isEditingMemberName = false
  let editingMemberName = ""
  let isUpdatingMemberName = false
  let updateMemberNameError: string | null = null
  let isLoadingMemberDetails = false
  let memberDetailError: string | null = null
  let detailedMemberInfo: any = null

  // Watch for changes to selectedMember and fetch details
  $: if (selectedMember) {
    fetchMemberDetails(selectedMember)
    editingMemberName = selectedMember.name || ""
    isEditingMemberName = false
    updateMemberNameError = null
  }

  async function fetchMemberDetails(member: UserProfile) {
    if (!$userStore.currentUser?.family_id) {
      memberDetailError = "No family context found."
      isLoadingMemberDetails = false
      return
    }

    isLoadingMemberDetails = true
    memberDetailError = null
    detailedMemberInfo = null

    try {
      if (member.$id === $userStore.currentUser.$id) {
        try {
          const currentUserAccount = await account.get()
          detailedMemberInfo = {
            email: currentUserAccount.email,
            name: currentUserAccount.name,
            userId: currentUserAccount.$id,
            isCurrentUser: true,
          }
          isLoadingMemberDetails = false
          return
        } catch (accountError) {
          console.warn("Could not get current user account info:", accountError)
        }
      }

      const extendedProfile = await databases.listDocuments(
        DATABASE_ID,
        USERS_EXTENDED_COLLECTION_ID,
        [Query.equal("user_id", member.$id)],
      )

      if (extendedProfile.documents.length > 0) {
        const profile = extendedProfile.documents[0]
        detailedMemberInfo = {
          email: profile.email || "Email not available",
          name: profile.name || member.name,
          userId: member.$id,
          role: profile.role,
          isCurrentUser: false,
        }
      } else {
        detailedMemberInfo = {
          email: "Email not available",
          name: member.name || "Name not available",
          userId: member.$id,
          role: member.role,
          isCurrentUser: false,
        }
      }

      isLoadingMemberDetails = false
    } catch (error) {
      console.error("Error fetching member details:", error)
      memberDetailError = "Failed to load member details"
      isLoadingMemberDetails = false
    }
  }

  function handleClose() {
    selectedMember = null
    isEditingMemberName = false
    editingMemberName = ""
    updateMemberNameError = null
    isLoadingMemberDetails = false
    memberDetailError = null
    detailedMemberInfo = null
    dispatch("close")
  }

  function handleStartEditingName() {
    if (!selectedMember) return
    isEditingMemberName = true
    editingMemberName = selectedMember.name || ""
    updateMemberNameError = null
  }

  function handleCancelEditingName() {
    if (!selectedMember) return
    isEditingMemberName = false
    editingMemberName = selectedMember.name || ""
    updateMemberNameError = null
  }

  async function handleSaveName() {
    if (!selectedMember || !editingMemberName.trim()) {
      updateMemberNameError = "Name is required."
      return
    }

    if (!selectedMember.$databaseId) {
      updateMemberNameError = "Member data not found."
      return
    }

    isUpdatingMemberName = true
    updateMemberNameError = null

    try {
      await databases.updateDocument(
        DATABASE_ID,
        USERS_EXTENDED_COLLECTION_ID,
        selectedMember.$databaseId,
        { name: editingMemberName.trim() },
      )

      // Update the selected member locally
      selectedMember.name = editingMemberName.trim()

      // Update detailed member info if available
      if (detailedMemberInfo) {
        detailedMemberInfo.name = editingMemberName.trim()
      }

      isEditingMemberName = false

      // Notify parent component of the update
      dispatch("memberUpdated", {
        member: selectedMember,
        updatedName: editingMemberName.trim(),
      })
    } catch (err: any) {
      console.error("Failed to update member name:", err)
      updateMemberNameError = err.message || "Failed to update name."
    } finally {
      isUpdatingMemberName = false
    }
  }

  function handleRemoveMember() {
    if (!selectedMember) return
    dispatch("removeMember", selectedMember)
  }
</script>

{#if selectedMember}
  <div
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40"
  >
    <div class="bg-white rounded-lg p-8 max-w-md w-full mx-4">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-xl font-bold text-gray-800">Member Details</h3>
        <button
          type="button"
          on:click={handleClose}
          class="text-gray-500 hover:text-gray-700 text-2xl"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div class="space-y-4 mb-6">
        <!-- Role Badge -->
        <div class="flex justify-center">
          <span
            class="px-4 py-2 rounded-full text-sm font-bold uppercase text-white {selectedMember.role ===
            'parent'
              ? 'bg-blue-600'
              : 'bg-green-600'}"
          >
            {selectedMember.role}
          </span>
        </div>

        <!-- Name Section -->
        <div class="space-y-2">
          <div class="block text-sm font-bold text-gray-700">Name:</div>
          {#if isEditingMemberName}
            <div class="space-y-2">
              <input
                type="text"
                bind:value={editingMemberName}
                placeholder="Enter member's name"
                disabled={isUpdatingMemberName}
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <div class="flex gap-2">
                <button
                  type="button"
                  on:click={handleSaveName}
                  disabled={isUpdatingMemberName}
                  class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  {#if isUpdatingMemberName}Saving...{:else}Save{/if}
                </button>
                <button
                  type="button"
                  on:click={handleCancelEditingName}
                  disabled={isUpdatingMemberName}
                  class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
              {#if updateMemberNameError}
                <p class="text-red-600 text-sm">{updateMemberNameError}</p>
              {/if}
            </div>
          {:else}
            <div class="flex justify-between items-center">
              <span class="text-gray-800 font-medium">
                {selectedMember.name || "No name set"}
              </span>
              <button
                type="button"
                on:click={handleStartEditingName}
                class="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors text-sm"
              >
                {selectedMember.name ? "Edit" : "Set Name"}
              </button>
            </div>
          {/if}
        </div>

        <!-- Email Section -->
        <div class="space-y-2">
          <div class="block text-sm font-bold text-gray-700">Email:</div>
          {#if isLoadingMemberDetails}
            <div class="text-gray-500 text-sm">Loading...</div>
          {:else if memberDetailError}
            <div class="text-red-600 text-sm">{memberDetailError}</div>
          {:else if detailedMemberInfo}
            <span class="text-gray-800">{detailedMemberInfo.email}</span>
          {:else}
            <span class="text-gray-500">No email information available</span>
          {/if}
        </div>

        <!-- Additional Member Information -->
        {#if detailedMemberInfo && !isLoadingMemberDetails}
          <!-- User ID -->
          <div class="space-y-2">
            <div class="block text-sm font-bold text-gray-700">User ID:</div>
            <span class="text-gray-600 text-sm font-mono"
              >{detailedMemberInfo.userId}</span
            >
          </div>

          <!-- Role Information -->
          {#if detailedMemberInfo.role}
            <div class="space-y-2">
              <div class="block text-sm font-bold text-gray-700">Role:</div>
              <span class="text-gray-800 capitalize"
                >{detailedMemberInfo.role}</span
              >
            </div>
          {/if}

          <!-- Current User Indicator -->
          {#if detailedMemberInfo.isCurrentUser}
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div class="flex items-center gap-2">
                <div class="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span class="text-blue-700 text-sm font-medium"
                  >This is you</span
                >
              </div>
            </div>
          {/if}
        {/if}

        <!-- Member ID (for debugging/admin purposes) -->
        <div class="space-y-2">
          <div class="block text-sm font-bold text-gray-700">Member ID:</div>
          <span class="text-gray-600 text-xs font-mono"
            >{selectedMember.$id}</span
          >
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex gap-4 justify-end pt-4 border-t border-gray-200">
        <button
          type="button"
          on:click={handleClose}
          class="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
        >
          Close
        </button>
        {#if selectedMember.$id !== currentUserId}
          <button
            type="button"
            on:click={handleRemoveMember}
            class="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Remove Member
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
