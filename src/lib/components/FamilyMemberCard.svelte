<script lang="ts">
  import { createEventDispatcher } from "svelte"
  import type { UserProfile } from "$lib/stores/userStore"

  const dispatch = createEventDispatcher()

  export let member: UserProfile

  function handleClick() {
    dispatch("memberClick", member)
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      handleClick()
    }
  }
</script>

<div
  class="border border-gray-300 rounded-lg p-6 bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer {member.role ===
  'parent'
    ? 'border-l-4 border-l-blue-600'
    : 'border-l-4 border-l-green-600'}"
  on:click={handleClick}
  on:keydown={handleKeydown}
  tabindex="0"
  role="button"
  aria-label="View details for {member.name || member.email}"
>
  <div class="flex justify-end mb-4">
    <span
      class="px-3 py-1 rounded-full text-xs font-bold uppercase text-white {member.role ===
      'parent'
        ? 'bg-blue-600'
        : 'bg-green-600'}"
    >
      {member.role}
    </span>
  </div>

  <div class="flex flex-col gap-2">
    <span class="font-bold text-lg text-gray-800">
      {member.name || "Unnamed User"}
    </span>
    <span class="text-gray-500 text-xs mt-2">Click to view details</span>
  </div>
</div>
