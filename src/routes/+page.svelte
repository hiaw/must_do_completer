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
  <p>Loading...</p>
{:else if !$userStore.currentUser}
  <div class="welcome-container">
    <h1>Welcome to Must-Dos Completer</h1>
    <p>A family task management app where parents can assign tasks and children can complete them!</p>
    
    <div class="features">
      <h2>Features:</h2>
      <ul>
        <li><strong>For Parents:</strong> Create and assign tasks to your children</li>
        <li><strong>For Children:</strong> View and complete your assigned tasks</li>
        <li><strong>Family Groups:</strong> Organize tasks within your family</li>
        <li><strong>Task Tracking:</strong> See completed tasks and progress</li>
      </ul>
    </div>

    <div class="auth-actions">
      <a href="/login" class="login-btn">Get Started - Login</a>
    </div>
  </div>
{:else}
  <!-- User is logged in but redirect hasn't happened yet -->
  <p>Redirecting to your dashboard...</p>
{/if}

<style>
  .welcome-container {
    max-width: 600px;
    margin: 2rem auto;
    padding: 2rem;
    text-align: center;
  }

  .welcome-container h1 {
    color: #007bff;
    margin-bottom: 1rem;
  }

  .features {
    margin: 2rem 0;
    text-align: left;
    background-color: #f8f9fa;
    padding: 1.5rem;
    border-radius: 8px;
  }

  .features h2 {
    margin-top: 0;
    color: #333;
  }

  .features ul {
    list-style-type: none;
    padding: 0;
  }

  .features li {
    margin: 0.75rem 0;
    padding-left: 1rem;
    position: relative;
  }

  .features li::before {
    content: '✓';
    position: absolute;
    left: 0;
    color: #28a745;
    font-weight: bold;
  }

  .auth-actions {
    margin-top: 2rem;
  }

  .login-btn {
    display: inline-block;
    padding: 0.75rem 2rem;
    background-color: #007bff;
    color: white;
    text-decoration: none;
    border-radius: 6px;
    font-weight: bold;
    transition: background-color 0.2s;
  }

  .login-btn:hover {
    background-color: #0056b3;
  }
</style>
