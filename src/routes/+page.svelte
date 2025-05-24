<script lang="ts">
  import { onMount } from 'svelte';
  import { userStore } from '$lib/stores/userStore';
  import { goto } from '$app/navigation';

  onMount(() => {
    const unsubscribe = userStore.subscribe((value) => {
      if (value.loading) return; // Still loading, wait

      if (value.currentUser) {
        // User is logged in, redirect to appropriate dashboard
        if (value.currentUser.role === 'parent') {
          goto('/parent/dashboard');
        } else if (value.currentUser.role === 'child') {
          goto('/child/dashboard');
        }
      }
      // If no user, stay on this page which will show the welcome message
    });

    return unsubscribe;
  });
</script>

{#if $userStore.loading}
  <p class="text-center text-gray-600">Loading...</p>
{:else if !$userStore.currentUser}
  <div class="max-w-2xl mx-auto mt-8 p-8 text-center">
    <h1 class="text-4xl font-bold text-blue-600 mb-4">Welcome to Must-Dos Completer</h1>
    <p class="text-lg text-gray-700 mb-8">A family task management app where parents can assign tasks and children can complete them!</p>
    
    <div class="my-8 text-left bg-gray-50 p-6 rounded-lg">
      <h2 class="text-2xl font-semibold text-gray-800 mt-0 mb-4">Features:</h2>
      <ul class="space-y-3">
        <li class="flex items-start">
          <span class="text-green-500 font-bold mr-3">✓</span>
          <span><strong>For Parents:</strong> Create and assign tasks to your children</span>
        </li>
        <li class="flex items-start">
          <span class="text-green-500 font-bold mr-3">✓</span>
          <span><strong>For Children:</strong> View and complete your assigned tasks</span>
        </li>
        <li class="flex items-start">
          <span class="text-green-500 font-bold mr-3">✓</span>
          <span><strong>Family Groups:</strong> Organize tasks within your family</span>
        </li>
        <li class="flex items-start">
          <span class="text-green-500 font-bold mr-3">✓</span>
          <span><strong>Task Tracking:</strong> See completed tasks and progress</span>
        </li>
      </ul>
    </div>

    <div class="mt-8">
      <a href="/login" class="inline-block px-8 py-3 bg-blue-600 text-white font-bold rounded-md hover:bg-blue-700 transition-colors duration-200 no-underline">
        Get Started - Login
      </a>
    </div>
  </div>
{:else}
  <!-- User is logged in but redirect hasn't happened yet -->
  <p class="text-center text-gray-600">Redirecting to your dashboard...</p>
{/if}
