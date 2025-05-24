<script lang="ts">
  import { createEventDispatcher } from "svelte"
  import type { UserProfile } from "$lib/stores/userStore"

  const dispatch = createEventDispatcher()

  export let selectedMember: UserProfile | null = null
  export let currentUserId: string | undefined = undefined
  export let isEditingMemberName = false
  export let editingMemberName = ""
  export let isUpdatingMemberName = false
  export let updateMemberNameError: string | null = null
  export let isLoadingMemberDetails = false
  export let memberDetailError: string | null = null
  export let detailedMemberInfo: any = null

  function handleClose() {
    dispatch("close")
  }

  function handleStartEditingName() {
    dispatch("startEditingName")
  }

  function handleCancelEditingName() {
    dispatch("cancelEditingName")
  }

  function handleSaveName() {
    dispatch("saveName", { name: editingMemberName })
  }

  function handleRemoveMember() {
    dispatch("removeMember")
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
