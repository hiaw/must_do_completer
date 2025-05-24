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
  <p class="text-center text-gray-600">Loading user data...</p>
{:else if $userStore.currentUser && $userStore.currentUser.role === 'parent'}
  <div class="max-w-6xl mx-auto p-8">
    <div class="flex flex-col md:flex-row md:justify-between md:items-center mb-8 pb-4 border-b-2 border-gray-200">
      <h1 class="text-3xl font-bold text-gray-800 mb-4 md:mb-0">Parent Dashboard</h1>
      <nav class="flex gap-4">
        <a href="/parent/family" class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors font-medium">
          Manage Family
        </a>
      </nav>
    </div>

    <div class="mb-8 p-6 border border-gray-200 rounded-lg bg-gray-50">
      {#if isEditingParentName}
        <div class="parent-name-edit">
          <h2 class="text-xl font-semibold text-gray-800 mb-4">Edit Your Name</h2>
          <div class="flex flex-col gap-4">
            <input 
              type="text" 
              bind:value={editingParentName} 
              placeholder="Enter your name"
              disabled={isUpdatingParentName}
              class="max-w-xs px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <div class="flex gap-2">
              <button 
                type="button" 
                on:click={saveParentName}
                disabled={isUpdatingParentName}
                class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                {#if isUpdatingParentName}Saving...{:else}Save{/if}
              </button>
              <button 
                type="button" 
                on:click={cancelEditingParentName}
                disabled={isUpdatingParentName}
                class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                Cancel
              </button>
            </div>
            {#if updateParentNameError}
              <p class="text-red-600 text-sm mt-2">{updateParentNameError}</p>
            {/if}
          </div>
        </div>
      {:else}
        <div class="flex justify-between items-center">
          <p class="text-lg">
            Welcome, <span class="font-bold text-blue-600">{$userStore.currentUser.name || $userStore.currentUser.email}</span>!
          </p>
          <button 
            type="button" 
            on:click={startEditingParentName}
            class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors text-sm font-medium"
          >
            {$userStore.currentUser.name ? 'Edit Name' : 'Set Name'}
          </button>
        </div>
      {/if}
    </div>

    {#if !$userStore.currentUser.family_id}
      <section class="bg-gray-50 border border-gray-300 rounded-lg p-8 text-center mb-8">
        <h2 class="text-2xl font-semibold text-gray-800 mb-4">Create Your Family Group</h2>
        <p class="text-gray-600 mb-8">To start managing tasks, you need to create a family group.</p>
        <form on:submit|preventDefault={handleCreateFamily} class="max-w-md mx-auto">
          <div class="mb-4 text-left">
            <label for="familyName" class="block mb-2 font-bold text-gray-700">Family Name:</label>
            <input 
              type="text" 
              id="familyName" 
              bind:value={familyName} 
              required 
              disabled={isCreatingFamily}
              class="w-full px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button 
            type="submit" 
            disabled={isCreatingFamily}
            class="w-full px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {#if isCreatingFamily}Creating...{:else}Create Family{/if}
          </button>
          {#if createFamilyError}
            <p class="text-red-600 text-sm mt-2">{createFamilyError}</p>
          {/if}
        </form>
      </section>
    {:else}
      <section class="bg-white border border-gray-200 rounded-lg p-8 mb-8">
        <h2 class="text-2xl font-semibold text-gray-800 mb-6 pb-2 border-b-2 border-blue-600">Create New Task</h2>
        <form on:submit|preventDefault={handleCreateTask}>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label for="taskTitle" class="block mb-2 font-bold text-gray-700">Title:</label>
              <input 
                type="text" 
                id="taskTitle" 
                bind:value={taskTitle} 
                required 
                disabled={isCreatingTask}
                class="w-full px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label for="assignTo" class="block mb-2 font-bold text-gray-700">Assign to Child:</label>
              {#if isLoadingChildren}
                <p class="text-gray-600 italic">Loading children...</p>
              {:else if children.length > 0}
                <select 
                  id="assignTo" 
                  bind:value={assignedToUserId} 
                  required 
                  disabled={isCreatingTask}
                  class="w-full px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="" disabled>Select a child</option>
                  {#each children as child}
                    <option value={child.$id}>{child.name || child.email}</option>
                  {/each}
                </select>
              {:else}
                <p class="text-red-600">No children found. <a href="/parent/family" class="text-blue-600 hover:underline">Add children to your family</a></p>
              {/if}
              {#if childrenError}
                <p class="text-red-600 text-sm">Error loading children: {childrenError}</p>
              {/if}
            </div>
          </div>
          
          <div class="mb-4">
            <label for="taskDescription" class="block mb-2 font-bold text-gray-700">Description (optional):</label>
            <textarea 
              id="taskDescription" 
              bind:value={taskDescription} 
              disabled={isCreatingTask}
              class="w-full px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-20 resize-y"
            ></textarea>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label for="taskPriority" class="block mb-2 font-bold text-gray-700">Priority:</label>
              <select 
                id="taskPriority" 
                bind:value={taskPriority} 
                disabled={isCreatingTask}
                class="w-full px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label for="taskPoints" class="block mb-2 font-bold text-gray-700">Points:</label>
              <input 
                type="number" 
                id="taskPoints" 
                bind:value={taskPoints} 
                min="0" 
                max="100" 
                disabled={isCreatingTask}
                class="w-full px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label for="taskDueDate" class="block mb-2 font-bold text-gray-700">Due Date (optional):</label>
              <input 
                type="date" 
                id="taskDueDate" 
                bind:value={taskDueDate} 
                disabled={isCreatingTask}
                class="w-full px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          
          <button 
            type="submit" 
            disabled={isCreatingTask || isLoadingChildren || children.length === 0}
            class="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {#if isCreatingTask}Creating Task...{:else}Create Task{/if}
          </button>
          
          {#if createTaskSuccess}
            <p class="text-green-600 text-sm mt-2 font-bold">{createTaskSuccess}</p>
          {/if}
          {#if createTaskError}
            <p class="text-red-600 text-sm mt-2">{createTaskError}</p>
          {/if}
        </form>
      </section>

      <section class="bg-white border border-gray-200 rounded-lg p-8 mb-8">
        <h2 class="text-2xl font-semibold text-gray-800 mb-6 pb-2 border-b-2 border-blue-600">All Family Tasks</h2>
        {#if isLoadingTasks}
          <p class="text-gray-600 italic">Loading tasks...</p>
        {:else if tasksError}
          <p class="text-red-600">Error loading tasks: {tasksError}</p>
        {:else if allTasks.length > 0}
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
            {#each allTasks as task (task.$id)}
              {@const assignedChild = children.find(member => member.$id === task.assigned_to_user_id)}
              <div class="border border-gray-300 rounded-lg p-6 bg-white shadow-sm hover:shadow-md transition-shadow {task.status === 'pending' ? 'border-l-4 border-l-blue-600' : 'border-l-4 border-l-green-600 opacity-90'}">
                <div class="flex justify-between items-start mb-4">
                  <h3 class="text-lg font-semibold text-gray-800 flex-1">{task.title}</h3>
                  <div class="flex gap-2 flex-shrink-0">
                    <span class="px-3 py-1 rounded-full text-xs font-bold uppercase {task.status === 'pending' ? 'bg-yellow-400 text-black' : 'bg-green-600 text-white'}">
                      {task.status}
                    </span>
                    <span class="px-3 py-1 rounded-full text-xs font-bold uppercase text-white {task.priority === 'low' ? 'bg-green-600' : task.priority === 'medium' ? 'bg-yellow-400 text-black' : 'bg-red-600'}">
                      {task.priority}
                    </span>
                  </div>
                </div>
                
                {#if task.description}
                  <p class="text-gray-600 italic mb-4 leading-relaxed">{task.description}</p>
                {/if}
                
                <div class="mt-4">
                  <div class="flex flex-col gap-2 mb-4">
                    <span class="text-sm text-blue-600">
                      <strong>Assigned to:</strong> {assignedChild?.name || assignedChild?.email || 'Unknown'}
                    </span>
                    <span class="text-sm text-green-600">
                      <strong>Points:</strong> {task.points}
                    </span>
                    {#if task.due_date}
                      <span class="text-sm text-red-600">
                        <strong>Due:</strong> {new Date(task.due_date).toLocaleDateString()}
                      </span>
                    {/if}
                  </div>
                  
                  <div class="flex flex-col gap-1 border-t border-gray-200 pt-3">
                    <small class="text-gray-500 text-xs">Created: {new Date(task.created_at).toLocaleDateString()}</small>
                    {#if task.updated_at !== task.created_at}
                      <small class="text-gray-500 text-xs">Updated: {new Date(task.updated_at).toLocaleDateString()}</small>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-center text-gray-500 py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            <p class="mb-2">No tasks created yet.</p>
            <p>Create your first task above to get started!</p>
          </div>
        {/if}
      </section>
    {/if}
  </div>
{:else}
  <p class="text-center text-gray-600">You do not have permission to view this page or are not logged in.</p>
{/if} 