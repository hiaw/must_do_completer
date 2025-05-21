<script lang="ts">
  import { userStore } from '$lib/stores/userStore';
  import { onMount } from 'svelte';

  // For client-side only checks or updates after initial load if needed
  // onMount(() => {
  //   // Potentially re-check or subscribe to other things if needed
  // });

</script>

<nav>
  <a href="/">Home</a>
  {#if $userStore.currentUser}
    <span>Hello, {$userStore.currentUser.name || $userStore.currentUser.email}!</span>
    {#if $userStore.currentUser.role === 'parent'}
      <a href="/parent/dashboard">Parent Dashboard</a>
    {/if}
    <a href="/login" on:click|preventDefault={async () => {
      const { logout } = await import('$lib/stores/userStore');
      await logout();
      // Optionally use goto('/login') or similar for navigation after logout
      window.location.href = '/login'; // Simple redirect
    }}>Logout</a>
  {:else if !$userStore.loading} <!-- Only show login if not loading and no user -->
    <a href="/login">Login</a>
  {/if}
</nav>

{#if $userStore.loading && !$userStore.currentUser} <!-- More nuanced loading message -->
  <p>Loading session...</p>
{:else if $userStore.error}
  <p style="color: red;">Session Error: {$userStore.error} <a href="/login">Try logging in</a></p>
{/if}

<main>
  <slot></slot>
</main>

<style>
  nav {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    background-color: #f0f0f0;
    margin-bottom: 1rem;
  }
  nav a {
    text-decoration: none;
    color: #333;
  }
  nav a:hover {
    text-decoration: underline;
  }
  main {
    padding: 1rem;
  }
</style> 
