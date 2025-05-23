<script lang="ts">
  import { onMount } from 'svelte';
  import { userStore, type UserProfile, loadUser } from '$lib/stores/userStore';
  import { goto } from '$app/navigation';
  import { teams, databases } from '$lib/appwrite'; // Import teams and databases
  import { Query, ID } from 'appwrite';

  // Assumed to be in your .env file, ensure they are!
  const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'must_dos_db';
  const USERS_EXTENDED_COLLECTION_ID = import.meta.env.VITE_APPWRITE_USERS_EXTENDED_COLLECTION_ID || 'users_extended';
  const TASKS_COLLECTION_ID = import.meta.env.VITE_APPWRITE_TASKS_COLLECTION_ID || 'tasks';

  let familyMembers: UserProfile[] = [];
  let children: UserProfile[] = [];
  let isLoadingFamily = true;
  let familyError: string | null = null;

  // Task creation form fields (basic)
  let taskTitle = '';
  let taskDescription = '';
  let assignedToUserId = '';
  let taskPriority: 'low' | 'medium' | 'high' = 'medium';
  let taskPoints = 10;
  let taskDueDate = '';
  let isCreatingTask = false;
  let createTaskError: string | null = null;
  let createTaskSuccess: string | null = null;

  // Task listing
  let allTasks: any[] = [];
  let isLoadingTasks = false;
  let tasksError: string | null = null;

  // Child name editing
  let editingChildId: string | null = null;
  let editingChildName = '';
  let isUpdatingChildName = false;
  let updateNameError: string | null = null;

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
        await fetchAllTasks();
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

  async function fetchAllTasks() {
    if (!$userStore.currentUser?.family_id) return;

    isLoadingTasks = true;
    tasksError = null;

    try {
      // Fetch all tasks for this family
      const tasksResponse = await databases.listDocuments(
        DATABASE_ID,
        TASKS_COLLECTION_ID,
        [
          Query.equal('family_id', $userStore.currentUser.family_id),
          Query.orderDesc('created_at')
        ]
      );

      allTasks = tasksResponse.documents;

    } catch (err: any) {
      console.error('Failed to fetch tasks:', err);
      tasksError = err.message;
    } finally {
      isLoadingTasks = false;
    }
  }

  async function handleCreateTask() {
    if (!$userStore.currentUser?.family_id) {
      createTaskError = 'No family context found.';
      return;
    }
    if (!taskTitle.trim() || !assignedToUserId) {
      createTaskError = 'Task title and assigned child are required.';
      return;
    }

    isCreatingTask = true;
    createTaskError = null;
    createTaskSuccess = null;

    try {
      const taskData = {
        title: taskTitle.trim(),
        description: taskDescription.trim() || '',
        assigned_to_user_id: assignedToUserId,
        created_by_user_id: $userStore.currentUser.$id,
        family_id: $userStore.currentUser.family_id,
        status: 'pending',
        priority: taskPriority,
        points: taskPoints,
        due_date: taskDueDate || undefined,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const newTask = await databases.createDocument(
        DATABASE_ID,
        TASKS_COLLECTION_ID,
        'unique()', // Let Appwrite generate the ID
        taskData
      );

      console.log('Task created successfully:', newTask);
      createTaskSuccess = `Task "${taskTitle}" assigned to child successfully!`;
      
      // Reset form
      taskTitle = '';
      taskDescription = '';
      assignedToUserId = '';
      taskPriority = 'medium';
      taskPoints = 10;
      taskDueDate = '';

      // Refresh task list
      await fetchAllTasks();

    } catch (err: any) {
      console.error('Failed to create task:', err);
      createTaskError = err.message || 'An unknown error occurred while creating the task.';
    } finally {
      isCreatingTask = false;
    }
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

  function startEditingChildName(child: UserProfile) {
    editingChildId = child.$id;
    editingChildName = child.name || '';
    updateNameError = null;
  }

  function cancelEditingChildName() {
    editingChildId = null;
    editingChildName = '';
    updateNameError = null;
  }

  async function saveChildName() {
    if (!editingChildId || !editingChildName.trim()) {
      updateNameError = 'Name is required.';
      return;
    }

    const child = familyMembers.find(m => m.$id === editingChildId);
    if (!child || !child.$databaseId) {
      updateNameError = 'Child data not found.';
      return;
    }

    isUpdatingChildName = true;
    updateNameError = null;

    try {
      await databases.updateDocument(
        DATABASE_ID,
        USERS_EXTENDED_COLLECTION_ID,
        child.$databaseId,
        { name: editingChildName.trim() }
      );

      // Update local state
      const childIndex = familyMembers.findIndex(m => m.$id === editingChildId);
      if (childIndex !== -1) {
        familyMembers[childIndex].name = editingChildName.trim();
        familyMembers = [...familyMembers]; // Trigger reactivity
        children = familyMembers.filter(member => member.role === 'child');
      }

      // Clear editing state
      editingChildId = null;
      editingChildName = '';

    } catch (err: any) {
      console.error('Failed to update child name:', err);
      updateNameError = err.message || 'Failed to update name.';
    } finally {
      isUpdatingChildName = false;
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
          <input type="text" id="taskTitle" bind:value={taskTitle} required disabled={isCreatingTask} />
        </div>
        <div>
          <label for="taskDescription">Description (optional):</label>
          <textarea id="taskDescription" bind:value={taskDescription} disabled={isCreatingTask}></textarea>
        </div>
        <div>
          <label for="assignTo">Assign to Child:</label>
          {#if isLoadingFamily}
            <p>Loading children...</p>
          {:else if children.length > 0}
            <select id="assignTo" bind:value={assignedToUserId} required disabled={isCreatingTask}>
              <option value="" disabled>Select a child</option>
              {#each children as child}
                <option value={child.$id}>{child.name || child.email}</option>
              {/each}
            </select>
          {:else}
            <p>No children found in your family. <a href="/parent/family">Manage Family</a></p>
          {/if}
          {#if familyError}
            <p style="color: red;">Error loading family: {familyError}</p>
          {/if}
        </div>
        <div class="form-row">
          <div>
            <label for="taskPriority">Priority:</label>
            <select id="taskPriority" bind:value={taskPriority} disabled={isCreatingTask}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <label for="taskPoints">Points:</label>
            <input type="number" id="taskPoints" bind:value={taskPoints} min="0" max="100" disabled={isCreatingTask} />
          </div>
        </div>
        <div>
          <label for="taskDueDate">Due Date (optional):</label>
          <input type="date" id="taskDueDate" bind:value={taskDueDate} disabled={isCreatingTask} />
        </div>
        <button type="submit" disabled={isCreatingTask || isLoadingFamily || children.length === 0}>
          {#if isCreatingTask}Creating Task...{:else}Create Task{/if}
        </button>
        {#if createTaskSuccess}
          <p style="color: green;">{createTaskSuccess}</p>
        {/if}
        {#if createTaskError}
          <p style="color: red;">{createTaskError}</p>
        {/if}
      </form>
    </section>

    <section>
      <h2>Children in Family</h2>
      {#if isLoadingFamily}
        <p>Loading family members...</p>
      {:else if children.length > 0}
        <div class="children-list">
          {#each children as child (child.$id)}
            <div class="child-item">
              {#if editingChildId === child.$id}
                <div class="child-edit-form">
                  <input 
                    type="text" 
                    bind:value={editingChildName} 
                    placeholder="Enter child's name"
                    disabled={isUpdatingChildName}
                    class="child-name-input"
                  />
                  <div class="edit-buttons">
                    <button 
                      type="button" 
                      on:click={saveChildName}
                      disabled={isUpdatingChildName}
                      class="save-btn"
                    >
                      {#if isUpdatingChildName}Saving...{:else}Save{/if}
                    </button>
                    <button 
                      type="button" 
                      on:click={cancelEditingChildName}
                      disabled={isUpdatingChildName}
                      class="cancel-btn"
                    >
                      Cancel
                    </button>
                  </div>
                  {#if updateNameError}
                    <p class="error-text">{updateNameError}</p>
                  {/if}
                </div>
              {:else}
                <div class="child-info">
                  <div class="child-details">
                    <span class="child-name">
                      {child.name || 'Unnamed Child'}
                    </span>
                    <span class="child-email">{child.email}</span>
                  </div>
                  <button 
                    type="button" 
                    on:click={() => startEditingChildName(child)}
                    class="edit-name-btn"
                  >
                    {child.name ? 'Edit Name' : 'Set Name'}
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {:else if familyMembers.length > 0 && children.length === 0}
        <p>No users with the 'child' role found in your family. <a href="/parent/family">Manage Family Roles</a></p>
      {:else}
        <p>No members found in your family. <a href="/parent/family">Manage Family</a></p>
      {/if}
      {#if familyError}
        <p style="color: red;">Error loading family members: {familyError}</p>
      {/if}
    </section>

    <section>
      <h2>All Family Tasks</h2>
      {#if isLoadingTasks}
        <p>Loading tasks...</p>
      {:else if tasksError}
        <p style="color: red;">Error loading tasks: {tasksError}</p>
      {:else if allTasks.length > 0}
        <div class="tasks-grid">
          {#each allTasks as task (task.$id)}
            {@const assignedChild = familyMembers.find(member => member.$id === task.assigned_to_user_id)}
            <div class="task-card {task.status}">
              <div class="task-header">
                <h3>{task.title}</h3>
                <div class="task-badges">
                  <span class="status-badge {task.status}">{task.status}</span>
                  <span class="priority-badge {task.priority}">{task.priority}</span>
                </div>
              </div>
              
              {#if task.description}
                <p class="task-description">{task.description}</p>
              {/if}
              
              <div class="task-details">
                <div class="task-meta">
                  <span class="assigned-to">
                    <strong>Assigned to:</strong> {assignedChild?.name || assignedChild?.email || 'Unknown'}
                  </span>
                  <span class="points">
                    <strong>Points:</strong> {task.points}
                  </span>
                  {#if task.due_date}
                    <span class="due-date">
                      <strong>Due:</strong> {new Date(task.due_date).toLocaleDateString()}
                    </span>
                  {/if}
                </div>
                
                <div class="task-timestamps">
                  <small>Created: {new Date(task.created_at).toLocaleDateString()}</small>
                  {#if task.updated_at !== task.created_at}
                    <small>Updated: {new Date(task.updated_at).toLocaleDateString()}</small>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <p class="no-tasks">No tasks created yet. Create your first task above!</p>
      {/if}
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
  
  input[type="number"],
  input[type="date"] {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-sizing: border-box;
  }
  
  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  
  .form-row > div {
    margin-bottom: 0;
  }
  
  .tasks-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
  }
  
  .task-card {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1rem;
    background-color: #fff;
    transition: box-shadow 0.2s;
  }
  
  .task-card:hover {
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }
  
  .task-card.pending {
    border-left: 4px solid #007bff;
  }
  
  .task-card.completed {
    border-left: 4px solid #28a745;
    opacity: 0.8;
  }
  
  .task-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 0.5rem;
  }
  
  .task-header h3 {
    margin: 0;
    color: #333;
    flex: 1;
  }
  
  .task-badges {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }
  
  .status-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: bold;
    text-transform: uppercase;
  }
  
  .status-badge.pending {
    background-color: #ffc107;
    color: #000;
  }
  
  .status-badge.completed {
    background-color: #28a745;
    color: white;
  }
  
  .priority-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: bold;
    text-transform: uppercase;
    color: white;
  }
  
  .priority-badge.low {
    background-color: #28a745;
  }
  
  .priority-badge.medium {
    background-color: #ffc107;
    color: #000;
  }
  
  .priority-badge.high {
    background-color: #dc3545;
  }
  
  .task-description {
    color: #666;
    font-style: italic;
    margin: 0.5rem 0;
  }
  
  .task-details {
    margin-top: 1rem;
  }
  
  .task-meta {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
  }
  
  .task-meta span {
    font-size: 0.875rem;
  }
  
  .assigned-to {
    color: #007bff;
  }
  
  .points {
    color: #28a745;
  }
  
  .due-date {
    color: #dc3545;
  }
  
  .task-timestamps {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    border-top: 1px solid #eee;
    padding-top: 0.5rem;
  }
  
  .task-timestamps small {
    color: #888;
    font-size: 0.75rem;
  }
  
  .no-tasks {
    text-align: center;
    color: #888;
    font-style: italic;
    padding: 2rem;
  }
  
  .children-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .child-item {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1rem;
    background-color: #fff;
  }
  
  .child-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .child-details {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .child-name {
    font-weight: bold;
    color: #333;
    font-size: 1rem;
  }
  
  .child-email {
    color: #666;
    font-size: 0.875rem;
  }
  
  .edit-name-btn {
    padding: 0.5rem 1rem;
    background-color: #6c757d;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
  }
  
  .edit-name-btn:hover {
    background-color: #5a6268;
  }
  
  .child-edit-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .child-name-input {
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
  }
  
  .edit-buttons {
    display: flex;
    gap: 0.5rem;
  }
  
  .save-btn {
    padding: 0.5rem 1rem;
    background-color: #28a745;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
  }
  
  .save-btn:hover:not(:disabled) {
    background-color: #218838;
  }
  
  .cancel-btn {
    padding: 0.5rem 1rem;
    background-color: #6c757d;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
  }
  
  .cancel-btn:hover:not(:disabled) {
    background-color: #5a6268;
  }
  
  .error-text {
    color: #dc3545;
    font-size: 0.875rem;
    margin: 0;
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