<script lang="ts">
  import { createEventDispatcher } from "svelte"
  import type { UserProfile } from "$lib/stores/userStore"
  import FamilyMemberCard from "./FamilyMemberCard.svelte"

  const dispatch = createEventDispatcher()

  export let familyMembers: UserProfile[] = []
  export let isLoadingFamily = false
  export let familyError: string | null = null

  function handleMemberClick(event: CustomEvent<UserProfile>) {
    dispatch("memberClick", event.detail)
  }

  function handleAddMember() {
    dispatch("addMember")
  }
</script>

<section class="bg-white">
  <div class="flex justify-between items-center mb-8">
    <h2 class="text-2xl font-semibold text-gray-800">Family Members</h2>
    <button
      type="button"
      on:click={handleAddMember}
      class="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-bold"
    >
      + Add Member
    </button>
  </div>

  {#if isLoadingFamily}
    <p class="text-center text-gray-600">Loading family members...</p>
  {:else if familyMembers.length > 0}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each familyMembers as member (member.$id)}
        <FamilyMemberCard {member} on:memberClick={handleMemberClick} />
      {/each}
    </div>
  {:else}
    <p class="text-center text-gray-500 italic py-8">
      No family members found.
    </p>
  {/if}

  {#if familyError}
    <p class="text-red-600 text-sm mt-4">
      Error loading family members: {familyError}
    </p>
  {/if}
</section>
