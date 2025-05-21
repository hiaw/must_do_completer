<script lang="ts">
  import { onMount } from 'svelte';
  import { userStore, type UserProfile, loadUser } from '$lib/stores/userStore';
  import { goto } from '$app/navigation';
  import { teams, databases } from '$lib/appwrite'; // Import teams and databases
  import { Query, ID } from 'appwrite';

  // Assumed to be in your .env file, ensure they are!
  const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'must_dos_db';
  const USERS_EXTENDED_COLLECTION_ID = import.meta.env.VITE_APPWRITE_USERS_EXTENDED_COLLECTION_ID || 'users_extended';

  let familyMembers: UserProfile[] = [];
  let children: UserProfile[] = [];
  let isLoadingFamily = true;
  let familyError: string | null = null;

  // Task creation form fields (basic)
  let taskTitle = '';
  let taskDescription = '';
  let assignedToUserId = '';

  // Family creation
  let familyName = '';
  let isCreatingFamily = false;
  let createFamilyError: string | null = null;

  onMount(() => {
    const unsubscribe = userStore.subscribe(async (value) => {
      if (value.loading) {
        // Still loading, do nothing yet
        return;
      }

      if (!value.currentUser || value.currentUser.role !== 'parent') {
        // No user, or not a parent, redirect to login
        // This also handles the case where value.error is set and currentUser became null
        goto('/login');
      } else if (value.currentUser.family_id) {
        // User is loaded, is a parent, and has a family_id
        await fetchFamilyMembers(value.currentUser.family_id);
      }
      // If currentUser is a parent but no family_id, the template handles showing the appropriate message.
      // No explicit 'else if' needed here for that case unless we want to trigger other script logic.
    });
    return unsubscribe; // Cleanup subscription
  });

  async function fetchFamilyMembers(familyTeamId: string) {
    isLoadingFamily = true;
    familyError = null;
    try {
      const response = await teams.listMemberships(familyTeamId);
      const memberUserIds = response.memberships.map(m => m.userId);

      if (memberUserIds.length === 0) {
        familyMembers = [];
        children = [];
        isLoadingFamily = false;
        return;
      }

      // Fetch extended profiles for these users
      const userProfilesResponse = await databases.listDocuments(
        DATABASE_ID,
        USERS_EXTENDED_COLLECTION_ID,
        [Query.equal('user_id', memberUserIds)] // Query for multiple user_ids
      );

      // Map Appwrite user details to UserProfile
      const detailedMembers: UserProfile[] = [];
      for (const membership of response.memberships) {
        const appwriteUser = await teams.getMembership(familyTeamId, membership.$id);
        const extendedProfile = userProfilesResponse.documents.find(doc => doc.user_id === membership.userId);
        
        detailedMembers.push({
          $id: membership.userId,
          name: extendedProfile?.name || appwriteUser.userName, // Prefer extended profile name
          email: appwriteUser.userEmail,
          prefs: {}, // Prefs not directly available here, might need another call or adjust if needed
          role: extendedProfile?.role as ('parent' | 'child') || (membership.roles.includes('child') ? 'child' : membership.roles.includes('parent') ? 'parent' : undefined),
          family_id: familyTeamId,
          $databaseId: extendedProfile?.$id,
          $collectionId: extendedProfile?.$collectionId
        });
      }
      
      familyMembers = detailedMembers;
      children = familyMembers.filter(member => member.role === 'child');

    } catch (err: any) {
      console.error('Failed to fetch family members:', err);
      familyError = err.message;
    } finally {
      isLoadingFamily = false;
    }
  }

  async function handleCreateTask() {
    if (!$userStore.currentUser?.family_id) {
      alert('No family context found.');
      return;
    }
    if (!taskTitle.trim() || !assignedToUserId) {
        alert('Task title and assigned child are required.');
        return;
    }
    console.log('Creating task:', {
      title: taskTitle,
      description: taskDescription,
      assignedToUserId: assignedToUserId,
      familyId: $userStore.currentUser.family_id,
      createdByUserId: $userStore.currentUser.$id
    });
    // TODO: Implement Appwrite database call to create task
    alert('Task creation logic not yet implemented.');
  }

  async function handleCreateFamily() {
    if (!familyName.trim()) {
      createFamilyError = 'Family name is required.';
      return;
    }
    if (!$userStore.currentUser || !$userStore.currentUser.$id || !$userStore.currentUser.$databaseId) {
      createFamilyError = 'Current user data is incomplete. Cannot create family.';
      console.error("User data for family creation:", $userStore.currentUser);
      return;
    }

    isCreatingFamily = true;
    createFamilyError = null;

    try {
      // 1. Create the Appwrite Team
      const newTeam = await teams.create(ID.unique(), familyName.trim(), ['owner', 'parent']);
      console.log('New team created:', newTeam);

      // 2. Update the parent's document in users_extended with the new family_id (team.$id)
      await databases.updateDocument(
        DATABASE_ID,
        USERS_EXTENDED_COLLECTION_ID,
        $userStore.currentUser.$databaseId, // This is the document ID from users_extended
        { family_id: newTeam.$id }
      );
      console.log('UsersExtended document updated with family_id.');

      // 3. Optionally, add the creator to the team explicitly if needed.
      // teams.createMembership(newTeam.$id, $userStore.currentUser.email, ['owner', 'parent'], '/'); // Example
      // For now, assuming the creator is owner by default from teams.create.

      // 4. Refresh user data to reflect the new family_id
      await loadUser(); 
      // The userStore subscription should automatically hide the create family form 
      // and show the main dashboard sections.

      familyName = ''; // Clear the input

    } catch (err: any) {
      console.error('Failed to create family:', err);
      createFamilyError = err.message || 'An unknown error occurred while creating the family.';
    } finally {
      isCreatingFamily = false;
    }
  }
</script>

{#if $userStore.loading}
  <p>Loading user data...</p>
{:else if $userStore.currentUser && $userStore.currentUser.role === 'parent'}
  <h1>Parent Dashboard</h1>
  <p>Welcome, {$userStore.currentUser.name || $userStore.currentUser.email}!</p>

  {#if !$userStore.currentUser.family_id}
    <section class="family-creation-section">
      <h2>Create Your Family Group</h2>
      <p>To start managing tasks, you need to create a family group.</p>
      <form on:submit|preventDefault={handleCreateFamily}>
        <div>
          <label for="familyName">Family Name:</label>
          <input type="text" id="familyName" bind:value={familyName} required disabled={isCreatingFamily} />
        </div>
        <button type="submit" disabled={isCreatingFamily}>
          {#if isCreatingFamily}Creating...{:else}Create Family{/if}
        </button>
        {#if createFamilyError}
          <p style="color: red;">{createFamilyError}</p>
        {/if}
      </form>
    </section>
  {:else}
    <section>
      <h2>Create New Task</h2>
      <form on:submit|preventDefault={handleCreateTask}>
        <div>
          <label for="taskTitle">Title:</label>
          <input type="text" id="taskTitle" bind:value={taskTitle} required />
        </div>
        <div>
          <label for="taskDescription">Description (optional):</label>
          <textarea id="taskDescription" bind:value={taskDescription}></textarea>
        </div>
        <div>
          <label for="assignTo">Assign to Child:</label>
          {#if isLoadingFamily}
            <p>Loading children...</p>
          {:else if children.length > 0}
            <select id="assignTo" bind:value={assignedToUserId} required>
              <option value="" disabled>Select a child</option>
              {#each children as child}
                <option value={child.$id}>{child.name || child.email}</option>
              {/each}
            </select>
          {:else}
            <p>No children found in your family. <a href="/family-management">Manage Family</a></p> <!-- Placeholder link -->
          {/if}
          {#if familyError}
            <p style="color: red;">Error loading family: {familyError}</p>
          {/if}
        </div>
        <button type="submit" disabled={isLoadingFamily || children.length === 0}>Create Task</button>
      </form>
    </section>

    <section>
      <h2>Children in Family</h2>
      {#if isLoadingFamily}
        <p>Loading family members...</p>
      {:else if children.length > 0}
        <ul>
          {#each children as child (child.$id)}
            <li>{child.name || child.email} (ID: {child.$id})</li>
            <!-- TODO: Add link to view tasks for this child -->
          {/each}
        </ul>
      {:else if familyMembers.length > 0 && children.length === 0}
        <p>No users with the 'child' role found in your family. <a href="/family-management">Manage Family Roles</a></p>
      {:else}
        <p>No members found in your family. <a href="/family-management">Manage Family</a></p>
      {/if}
      {#if familyError}
        <p style="color: red;">Error loading family members: {familyError}</p>
      {/if}
    </section>

    <section>
      <h2>All Tasks (placeholder)</h2>
      <!-- Task list will go here -->
      <p>Task listing will be implemented next.</p>
    </section>
  {/if}
{:else}
  <!-- This case should ideally be handled by the redirect in onMount -->
  <p>You do not have permission to view this page or are not logged in.</p>
{/if}

<style>
  section {
    margin-bottom: 2rem;
    padding: 1rem;
    border: 1px solid #eee;
    border-radius: 8px;
  }
  .family-creation-section {
    background-color: #f9f9f9;
  }
  form div {
    margin-bottom: 1rem;
  }
  label {
    display: block;
    margin-bottom: 0.25rem;
  }
  input[type="text"],
  textarea,
  select {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-sizing: border-box;
  }
  button {
    padding: 0.75rem 1.5rem;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  button:hover {
    background-color: #0056b3;
  }
  button:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }
</style> 