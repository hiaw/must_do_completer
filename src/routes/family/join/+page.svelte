<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { teams } from '$lib/appwrite';
  import { page } from '$app/stores';

  let message = 'Processing your invitation...';
  let error: string | null = null;

  onMount(async () => {
    const params = $page.url.searchParams;
    const teamId = params.get('teamId');
    const membershipId = params.get('membershipId');
    const userId = params.get('userId');
    const secret = params.get('secret');
    // invitedRole is no longer strictly needed here for DB operations,
    // as loadUser will derive it from team roles after login.

    if (!teamId || !membershipId || !userId || !secret) {
      error = 'Invalid invitation link. Required parameters are missing.';
      message = '';
      return;
    }

    try {
      await teams.updateMembershipStatus(teamId, membershipId, userId, secret);
      message = 'Invitation accepted! You have successfully joined the family. Please log in to continue.';
      
      // Redirect to login, which will then allow loadUser to sync the profile
      setTimeout(() => {
        goto('/login');
      }, 3000); // Give user a moment to read the message

    } catch (err: any) {
      console.error('Failed to accept team invitation:', err);
      error = err.message || 'An error occurred while trying to accept the invitation.';
      if (err.message && err.message.includes('already a team member')) {
        message = 'You are already a member of this team. Please log in.';
        error = null; // Clear error if it's just an already-member notice
        setTimeout(() => { goto('/login'); }, 3000);
      } else {
        message = '';
      }
    }
  });

</script>

<div>
  {#if message}
    <p>{message}</p>
  {/if}
  {#if error}
    <p style="color: red;">Error: {error}</p>
    <p>If the problem persists, please contact support or <a href="/login">try logging in</a>.</p>
  {/if}
</div>

<style>
  div {
    padding: 2rem;
    text-align: center;
  }
</style> 