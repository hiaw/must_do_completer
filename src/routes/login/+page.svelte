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

<div class="max-w-md mx-auto mt-16 p-8 bg-white border border-gray-200 rounded-lg shadow-sm">
  <h1 class="text-3xl font-bold text-gray-800 mb-8 text-center">Login</h1>
  
  <form on:submit|preventDefault={sendMagicLink} class="space-y-6">
    <div>
      <label for="email" class="block text-sm font-bold text-gray-700 mb-2">Email:</label>
      <input 
        id="email" 
        type="email" 
        bind:value={email} 
        required 
        class="w-full px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        placeholder="Enter your email address"
      />
    </div>
    
    <button 
      type="submit" 
      disabled={loading}
      class="w-full px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
    >
      {loading ? 'Sending...' : 'Send Magic Link'}
    </button>
  </form>

  {#if message}
    <p class="text-green-600 text-center mt-4 font-medium">{message}</p>
  {/if}
  {#if error}
    <p class="text-red-600 text-center mt-4">{error}</p>
  {/if}
</div> 