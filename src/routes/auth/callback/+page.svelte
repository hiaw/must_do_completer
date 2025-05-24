<script lang="ts">
  import { onMount } from 'svelte';
  import { account } from '$lib/appwrite';
  import { goto } from '$app/navigation';

  let message = '';
  let error = '';

  onMount(async () => {
    const url = new URL(window.location.href);
    const userId = url.searchParams.get('userId');
    const secret = url.searchParams.get('secret');

    if (userId && secret) {
      try {
        await account.createSession(userId, secret);
        message = 'Login successful! Redirecting...';
        setTimeout(() => goto('/'), 1500);
      } catch (err: any) {
        error = err.message || 'Failed to complete login.';
      }
    } else {
      error = 'Missing userId or secret in URL.';
    }
  });
</script>

<div class="max-w-md mx-auto mt-16 p-8 bg-white border border-gray-200 rounded-lg shadow-sm text-center">
  <h1 class="text-3xl font-bold text-gray-800 mb-8">Authenticating...</h1>
  
  {#if message}
    <p class="text-green-600 font-medium">{message}</p>
  {/if}
  {#if error}
    <p class="text-red-600">{error}</p>
  {/if}
</div> 