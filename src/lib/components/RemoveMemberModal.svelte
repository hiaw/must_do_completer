<script lang="ts">
  import { createEventDispatcher } from "svelte"
  import type { UserProfile } from "$lib/stores/userStore"

  const dispatch = createEventDispatcher()

  export let memberToRemove: UserProfile | null = null
  export let isRemovingMember = false
  export let removeMemberError: string | null = null

  function handleCancel() {
    dispatch("cancel")
  }

  function handleConfirm() {
    dispatch("confirm")
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
