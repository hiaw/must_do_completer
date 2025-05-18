<script lang="ts">
  import { account } from '$lib/appwrite';
  import { ID } from 'appwrite';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  let email = '';
  let loading = false;
  let message = '';
  let error = '';

  async function sendMagicLink() {
    loading = true;
    message = '';
    error = '';
    try {
      const redirectUrl = `${window.location.origin}/auth/callback`;
      await account.createMagicURLToken(ID.unique(), email, redirectUrl);
      message = 'Check your email for a magic link!';
    } catch (err: any) {
      error = err.message || 'Failed to send magic link.';
    } finally {
      loading = false;
    }
  }
</script>

<h1>Login</h1>
<form on:submit|preventDefault={sendMagicLink}>
  <label for="email">Email:</label>
  <input id="email" type="email" bind:value={email} required />
  <button type="submit" disabled={loading}>{loading ? 'Sending...' : 'Send Magic Link'}</button>
</form>

{#if message}
  <p style="color: green">{message}</p>
{/if}
{#if error}
  <p style="color: red">{error}</p>
{/if} 