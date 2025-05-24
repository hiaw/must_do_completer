<script lang="ts">
  import '../app.css';
  import { userStore } from '$lib/stores/userStore';
  import { onMount } from 'svelte';

  // For client-side only checks or updates after initial load if needed
  // onMount(() => {
  //   // Potentially re-check or subscribe to other things if needed
  // });

</script>

<nav class="flex gap-4 p-4 bg-gray-100 mb-4">
  <a href="/" class="text-gray-800 hover:text-blue-600 hover:underline">Home</a>
  {#if $userStore.currentUser}
    <span class="text-gray-700">Hello, {$userStore.currentUser.name || $userStore.currentUser.email}!</span>
    {#if $userStore.currentUser.role === 'parent'}
      <a href="/parent/dashboard" class="text-gray-800 hover:text-blue-600 hover:underline">Parent Dashboard</a>
    {:else if $userStore.currentUser.role === 'child'}
      <a href="/child/dashboard" class="text-gray-800 hover:text-blue-600 hover:underline">My Tasks</a>
    {/if}
    <a href="/login" on:click|preventDefault={async () => {
      const { logout } = await import('$lib/stores/userStore');
      await logout();
      // Optionally use goto('/login') or similar for navigation after logout
      window.location.href = '/login'; // Simple redirect
    }} class="text-gray-800 hover:text-red-600 hover:underline">Logout</a>
  {:else if !$userStore.loading} <!-- Only show login if not loading and no user -->
    <a href="/login" class="text-gray-800 hover:text-blue-600 hover:underline">Login</a>
  {/if}
</nav>

{#if $userStore.loading && !$userStore.currentUser} <!-- More nuanced loading message -->
  <p class="text-center text-gray-600">Loading session...</p>
{:else if $userStore.error}
  <p class="text-red-600 text-center">Session Error: {$userStore.error} <a href="/login" class="text-blue-600 hover:underline">Try logging in</a></p>
{/if}

<main class="p-4">
  <slot></slot>
</main>
