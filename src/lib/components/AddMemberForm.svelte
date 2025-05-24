<script lang="ts">
  import { createEventDispatcher } from "svelte"

  const dispatch = createEventDispatcher()

  export let newMemberEmail = ""
  export let newMemberName = ""
  export let newMemberRole: "parent" | "child" = "child"
  export let isInvitingMember = false
  export let inviteMemberError: string | null = null
  export let inviteMemberSuccess: string | null = null

  function handleInvite() {
    dispatch("inviteMember", {
      email: newMemberEmail,
      name: newMemberName,
      role: newMemberRole,
    })
  }

  function handleCancel() {
    dispatch("cancel")
  }
</script>

<div class="bg-gray-50 border border-gray-300 rounded-lg p-8 mb-8">
  <h3 class="text-xl font-semibold text-gray-800 mb-6">Invite New Member</h3>
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
    <div class="flex flex-col gap-2">
      <label for="newMemberEmail" class="font-bold text-gray-700">
        Member's Email:
      </label>
      <input
        type="email"
        id="newMemberEmail"
        bind:value={newMemberEmail}
        placeholder="member@example.com"
        disabled={isInvitingMember}
        required
        class="px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
    </div>
    <div class="flex flex-col gap-2">
      <label for="newMemberName" class="font-bold text-gray-700">
        Member's Name (optional):
      </label>
      <input
        type="text"
        id="newMemberName"
        bind:value={newMemberName}
        placeholder="e.g., Emma, Jake"
        disabled={isInvitingMember}
        class="px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
    </div>
    <div class="flex flex-col gap-2">
      <label for="newMemberRole" class="font-bold text-gray-700"> Role: </label>
      <select
        id="newMemberRole"
        bind:value={newMemberRole}
        disabled={isInvitingMember}
        class="px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        <option value="child">Child</option>
        <option value="parent">Parent</option>
      </select>
    </div>
  </div>
  <div class="flex gap-2">
    <button
      type="button"
      on:click={handleInvite}
      disabled={isInvitingMember}
      class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
    >
      {#if isInvitingMember}Sending Invitation...{:else}Send Invitation{/if}
    </button>
    <button
      type="button"
      on:click={handleCancel}
      disabled={isInvitingMember}
      class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
    >
      Cancel
    </button>
  </div>
  {#if inviteMemberSuccess}
    <p class="text-green-600 text-sm mt-2 font-bold">
      {inviteMemberSuccess}
    </p>
  {/if}
  {#if inviteMemberError}
    <p class="text-red-600 text-sm mt-2">{inviteMemberError}</p>
  {/if}
</div>
