<script lang="ts">
  import { createEventDispatcher } from "svelte"

  const dispatch = createEventDispatcher()

  export let familyName = ""
  export let isCreatingFamily = false
  export let createFamilyError: string | null = null

  function handleSubmit() {
    dispatch("createFamily", { familyName })
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
