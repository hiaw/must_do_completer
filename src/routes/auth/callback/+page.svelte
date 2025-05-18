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

<h1>Authenticating...</h1>
{#if message}
  <p style="color: green">{message}</p>
{/if}
{#if error}
  <p style="color: red">{error}</p>
{/if} 