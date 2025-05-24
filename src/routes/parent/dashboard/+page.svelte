<script lang="ts">
  import { onMount } from 'svelte';
  import { userStore, type UserProfile, loadUser } from '$lib/stores/userStore';
  import { goto } from '$app/navigation';
  import { teams, databases } from '$lib/appwrite';
  import { Query, ID } from 'appwrite';

  const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'must_dos_db';
  const USERS_EXTENDED_COLLECTION_ID = import.meta.env.VITE_APPWRITE_USERS_EXTENDED_COLLECTION_ID || 'users_extended';
  const TASKS_COLLECTION_ID = import.meta.env.VITE_APPWRITE_TASKS_COLLECTION_ID || 'tasks';

  let children: UserProfile[] = [];
  let isLoadingChildren = true;
  let childrenError: string | null = null;

  // Task creation form fields
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

  // Parent name editing
  let isEditingParentName = false;
  let editingParentName = '';
  let isUpdatingParentName = false;
  let updateParentNameError: string | null = null;

  // Family creation
  let familyName = '';
  let isCreatingFamily = false;
  let createFamilyError: string | null = null;

  onMount(() => {
    const unsubscribe = userStore.subscribe(async (value) => {
      if (value.loading) {
        return;
      }

      if (!value.currentUser || value.currentUser.role !== 'parent') {
        goto('/login');
      } else if (value.currentUser.family_id) {
        await fetchChildren(value.currentUser.family_id);
        await fetchAllTasks();
      }
    });
    return unsubscribe;
  });

  async function fetchChildren(familyTeamId: string) {
    isLoadingChildren = true;
    childrenError = null;
    try {
      const response = await teams.listMemberships(familyTeamId);
      const memberUserIds = response.memberships.map(m => m.userId);

      if (memberUserIds.length === 0) {
        children = [];
        isLoadingChildren = false;
        return;
      }

      const userProfilesResponse = await databases.listDocuments(
        DATABASE_ID,
        USERS_EXTENDED_COLLECTION_ID,
        [Query.equal('user_id', memberUserIds)]
      );

      const allMembers: UserProfile[] = [];
      for (const membership of response.memberships) {
        const appwriteUser = await teams.getMembership(familyTeamId, membership.$id);
        const extendedProfile = userProfilesResponse.documents.find(doc => doc.user_id === membership.userId);
        
        const memberName = extendedProfile?.name || appwriteUser.userName || membership.userName || 'Unnamed User';
        
        allMembers.push({
          $id: membership.userId,
          name: memberName,
          email: appwriteUser.userEmail,
          prefs: {},
          role: extendedProfile?.role as ('parent' | 'child') || (membership.roles.includes('child') ? 'child' : membership.roles.includes('parent') ? 'parent' : undefined),
          family_id: familyTeamId,
          $databaseId: extendedProfile?.$id,
          $collectionId: extendedProfile?.$collectionId
        });
      }
      
      children = allMembers.filter(member => member.role === 'child');

    } catch (err: any) {
      console.error('Failed to fetch children:', err);
      childrenError = err.message;
    } finally {
      isLoadingChildren = false;
    }
  }

  async function fetchAllTasks() {
    if (!$userStore.currentUser?.family_id) return;

    isLoadingTasks = true;
    tasksError = null;

    try {
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
        'unique()',
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
      return;
    }

    isCreatingFamily = true;
    createFamilyError = null;

    try {
      const newTeam = await teams.create(ID.unique(), familyName.trim(), ['owner', 'parent']);
      
      await databases.updateDocument(
        DATABASE_ID,
        USERS_EXTENDED_COLLECTION_ID,
        $userStore.currentUser.$databaseId,
        { family_id: newTeam.$id }
      );

      await loadUser();
      familyName = '';

    } catch (err: any) {
      console.error('Failed to create family:', err);
      createFamilyError = err.message || 'An unknown error occurred while creating the family.';
    } finally {
      isCreatingFamily = false;
    }
  }

  function startEditingParentName() {
    isEditingParentName = true;
    editingParentName = $userStore.currentUser?.name || '';
    updateParentNameError = null;
  }

  function cancelEditingParentName() {
    isEditingParentName = false;
    editingParentName = '';
    updateParentNameError = null;
  }

  async function saveParentName() {
    if (!editingParentName.trim()) {
      updateParentNameError = 'Name is required.';
      return;
    }

    if (!$userStore.currentUser?.$databaseId) {
      updateParentNameError = 'User data not found.';
      return;
    }

    isUpdatingParentName = true;
    updateParentNameError = null;

    try {
      await databases.updateDocument(
        DATABASE_ID,
        USERS_EXTENDED_COLLECTION_ID,
        $userStore.currentUser.$databaseId,
        { name: editingParentName.trim() }
      );

      await loadUser();

      isEditingParentName = false;
      editingParentName = '';

    } catch (err: any) {
      console.error('Failed to update parent name:', err);
      updateParentNameError = err.message || 'Failed to update name.';
    } finally {
      isUpdatingParentName = false;
    }
  }
</script>

{#if $userStore.loading}
  <p>Loading user data...</p>
{:else if $userStore.currentUser && $userStore.currentUser.role === 'parent'}
  <div class="dashboard">
    <div class="dashboard-header">
      <h1>Parent Dashboard</h1>
      <nav class="dashboard-nav">
        <a href="/parent/family" class="nav-link">Manage Family</a>
      </nav>
    </div>

    <div class="welcome-section">
      {#if isEditingParentName}
        <div class="parent-name-edit">
          <h2>Edit Your Name</h2>
          <div class="parent-edit-form">
            <input 
              type="text" 
              bind:value={editingParentName} 
              placeholder="Enter your name"
              disabled={isUpdatingParentName}
              class="parent-name-input"
            />
            <div class="edit-buttons">
              <button 
                type="button" 
                on:click={saveParentName}
                disabled={isUpdatingParentName}
                class="save-btn"
              >
                {#if isUpdatingParentName}Saving...{:else}Save{/if}
              </button>
              <button 
                type="button" 
                on:click={cancelEditingParentName}
                disabled={isUpdatingParentName}
                class="cancel-btn"
              >
                Cancel
              </button>
            </div>
            {#if updateParentNameError}
              <p class="error-text">{updateParentNameError}</p>
            {/if}
          </div>
        </div>
      {:else}
        <div class="welcome-info">
          <p class="welcome-text">
            Welcome, <span class="user-name">{$userStore.currentUser.name || $userStore.currentUser.email}</span>!
          </p>
          <button 
            type="button" 
            on:click={startEditingParentName}
            class="edit-name-btn"
          >
            {$userStore.currentUser.name ? 'Edit Name' : 'Set Name'}
          </button>
        </div>
      {/if}
    </div>

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
            <p class="error-text">{createFamilyError}</p>
          {/if}
        </form>
      </section>
    {:else}
      <section class="task-creation-section">
        <h2>Create New Task</h2>
        <form on:submit|preventDefault={handleCreateTask}>
          <div class="form-grid">
            <div>
              <label for="taskTitle">Title:</label>
              <input type="text" id="taskTitle" bind:value={taskTitle} required disabled={isCreatingTask} />
            </div>
            <div>
              <label for="assignTo">Assign to Child:</label>
              {#if isLoadingChildren}
                <p class="loading-text">Loading children...</p>
              {:else if children.length > 0}
                <select id="assignTo" bind:value={assignedToUserId} required disabled={isCreatingTask}>
                  <option value="" disabled>Select a child</option>
                  {#each children as child}
                    <option value={child.$id}>{child.name || child.email}</option>
                  {/each}
                </select>
              {:else}
                <p class="no-children-text">No children found. <a href="/parent/family">Add children to your family</a></p>
              {/if}
              {#if childrenError}
                <p class="error-text">Error loading children: {childrenError}</p>
              {/if}
            </div>
          </div>
          
          <div>
            <label for="taskDescription">Description (optional):</label>
            <textarea id="taskDescription" bind:value={taskDescription} disabled={isCreatingTask}></textarea>
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
            <div>
              <label for="taskDueDate">Due Date (optional):</label>
              <input type="date" id="taskDueDate" bind:value={taskDueDate} disabled={isCreatingTask} />
            </div>
          </div>
          
          <button type="submit" disabled={isCreatingTask || isLoadingChildren || children.length === 0}>
            {#if isCreatingTask}Creating Task...{:else}Create Task{/if}
          </button>
          
          {#if createTaskSuccess}
            <p class="success-text">{createTaskSuccess}</p>
          {/if}
          {#if createTaskError}
            <p class="error-text">{createTaskError}</p>
          {/if}
        </form>
      </section>

      <section class="tasks-section">
        <h2>All Family Tasks</h2>
        {#if isLoadingTasks}
          <p class="loading-text">Loading tasks...</p>
        {:else if tasksError}
          <p class="error-text">Error loading tasks: {tasksError}</p>
        {:else if allTasks.length > 0}
          <div class="tasks-grid">
            {#each allTasks as task (task.$id)}
              {@const assignedChild = children.find(member => member.$id === task.assigned_to_user_id)}
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
          <div class="no-tasks">
            <p>No tasks created yet.</p>
            <p>Create your first task above to get started!</p>
          </div>
        {/if}
      </section>
    {/if}
  </div>
{:else}
  <p>You do not have permission to view this page or are not logged in.</p>
{/if}

<style>
  .dashboard {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }

  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid #eee;
  }

  .dashboard-header h1 {
    margin: 0;
    color: #333;
  }

  .dashboard-nav {
    display: flex;
    gap: 1rem;
  }

  .nav-link {
    padding: 0.5rem 1rem;
    background-color: #6c757d;
    color: white;
    text-decoration: none;
    border-radius: 4px;
    font-weight: 500;
    transition: background-color 0.2s;
  }

  .nav-link:hover {
    background-color: #5a6268;
  }

  .welcome-section {
    margin-bottom: 2rem;
    padding: 1.5rem;
    border: 1px solid #eee;
    border-radius: 8px;
    background-color: #f8f9fa;
  }

  .welcome-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .welcome-text {
    margin: 0;
    font-size: 1.1rem;
  }

  .user-name {
    font-weight: bold;
    color: #007bff;
  }

  .parent-name-edit h2 {
    margin: 0 0 1rem 0;
    color: #333;
  }

  .parent-edit-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .parent-name-input {
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
    max-width: 300px;
  }

  .family-creation-section {
    background-color: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    padding: 2rem;
    text-align: center;
    margin-bottom: 2rem;
  }

  .family-creation-section h2 {
    color: #333;
    margin-bottom: 1rem;
  }

  .family-creation-section p {
    color: #666;
    margin-bottom: 2rem;
  }

  .family-creation-section form {
    max-width: 400px;
    margin: 0 auto;
  }

  .family-creation-section div {
    margin-bottom: 1rem;
    text-align: left;
  }

  .family-creation-section label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: bold;
  }

  .family-creation-section input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
  }

  .task-creation-section,
  .tasks-section {
    background-color: #fff;
    border: 1px solid #eee;
    border-radius: 8px;
    padding: 2rem;
    margin-bottom: 2rem;
  }

  .task-creation-section h2,
  .tasks-section h2 {
    margin: 0 0 1.5rem 0;
    color: #333;
    border-bottom: 2px solid #007bff;
    padding-bottom: 0.5rem;
  }

  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .form-grid > div,
  .form-row > div {
    margin-bottom: 0;
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: bold;
    color: #333;
  }

  input[type="text"],
  input[type="number"],
  input[type="date"],
  textarea,
  select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
    box-sizing: border-box;
  }

  textarea {
    min-height: 80px;
    resize: vertical;
  }

  .loading-text {
    color: #666;
    font-style: italic;
    margin: 0;
  }

  .no-children-text {
    color: #dc3545;
    margin: 0;
  }

  .no-children-text a {
    color: #007bff;
    text-decoration: none;
  }

  .no-children-text a:hover {
    text-decoration: underline;
  }

  .tasks-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1.5rem;
    margin-top: 1rem;
  }

  .task-card {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1.5rem;
    background-color: #fff;
    transition: box-shadow 0.2s;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .task-card:hover {
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }

  .task-card.pending {
    border-left: 4px solid #007bff;
  }

  .task-card.completed {
    border-left: 4px solid #28a745;
    opacity: 0.9;
  }

  .task-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
  }

  .task-header h3 {
    margin: 0;
    color: #333;
    flex: 1;
    font-size: 1.1rem;
  }

  .task-badges {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .status-badge {
    padding: 0.25rem 0.75rem;
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
    padding: 0.25rem 0.75rem;
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
    margin: 0 0 1rem 0;
    line-height: 1.4;
  }

  .task-details {
    margin-top: 1rem;
  }

  .task-meta {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
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
    padding-top: 0.75rem;
  }

  .task-timestamps small {
    color: #888;
    font-size: 0.75rem;
  }

  .no-tasks {
    text-align: center;
    color: #888;
    padding: 3rem 2rem;
    background-color: #f8f9fa;
    border-radius: 8px;
    border: 2px dashed #dee2e6;
  }

  .no-tasks p {
    margin: 0.5rem 0;
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
    font-weight: 500;
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
    font-weight: 500;
  }

  .cancel-btn:hover:not(:disabled) {
    background-color: #5a6268;
  }

  .edit-name-btn {
    padding: 0.5rem 1rem;
    background-color: #6c757d;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .edit-name-btn:hover {
    background-color: #5a6268;
  }

  .error-text {
    color: #dc3545;
    font-size: 0.875rem;
    margin: 0.5rem 0 0 0;
  }

  .success-text {
    color: #28a745;
    font-size: 0.875rem;
    margin: 0.5rem 0 0 0;
    font-weight: bold;
  }

  button {
    padding: 0.75rem 1.5rem;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
    font-size: 1rem;
    transition: background-color 0.2s;
  }

  button:hover:not(:disabled) {
    background-color: #0056b3;
  }

  button:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }

  @media (max-width: 768px) {
    .dashboard {
      padding: 1rem;
    }

    .dashboard-header {
      flex-direction: column;
      gap: 1rem;
      align-items: flex-start;
    }

    .form-grid {
      grid-template-columns: 1fr;
    }

    .form-row {
      grid-template-columns: 1fr;
    }

    .tasks-grid {
      grid-template-columns: 1fr;
    }

    .task-header {
      flex-direction: column;
      gap: 0.5rem;
      align-items: flex-start;
    }

    .task-badges {
      align-self: flex-end;
    }
  }
</style> 