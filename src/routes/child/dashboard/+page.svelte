<script lang="ts">
  import { onMount } from 'svelte';
  import { userStore } from '$lib/stores/userStore';
  import { goto } from '$app/navigation';
  import { databases } from '$lib/appwrite';
  import { Query } from 'appwrite';

  // Environment variables for database collections
  const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'must_dos_db';
  const TASKS_COLLECTION_ID = import.meta.env.VITE_APPWRITE_TASKS_COLLECTION_ID || 'tasks';
  const TASK_HISTORY_COLLECTION_ID = import.meta.env.VITE_APPWRITE_TASK_HISTORY_COLLECTION_ID || 'task_history';

  // Types
  interface Task {
    $id: string;
    title: string;
    description?: string;
    assigned_to_user_id: string;
    created_by_user_id: string;
    family_id: string;
    status: 'pending' | 'completed';
    due_date?: string;
    points?: number;
    priority: 'low' | 'medium' | 'high';
    created_at?: string;
    updated_at?: string;
  }

  interface TaskCompletion {
    $id: string;
    task_id: string;
    user_id: string;
    family_id: string;
    completed_at: string;
    verified_by_parent?: string;
    points_awarded?: number;
  }

  // State
  let tasks: Task[] = [];
  let completedTasks: TaskCompletion[] = [];
  let isLoadingTasks = true;
  let taskError: string | null = null;
  let completingTaskId: string | null = null;

  onMount(() => {
    const unsubscribe = userStore.subscribe(async (value) => {
      if (value.loading) return;

      if (!value.currentUser || value.currentUser.role !== 'child') {
        // Not a child user, redirect to login
        goto('/login');
      } else if (value.currentUser.family_id) {
        // User is loaded, is a child, and has a family_id
        await fetchTasks();
      }
    });
    return unsubscribe;
  });

  async function fetchTasks() {
    if (!$userStore.currentUser) return;

    isLoadingTasks = true;
    taskError = null;

    try {
      // Fetch tasks assigned to this child
      const tasksResponse = await databases.listDocuments(
        DATABASE_ID,
        TASKS_COLLECTION_ID,
        [
          Query.equal('assigned_to_user_id', $userStore.currentUser.$id),
          Query.equal('family_id', $userStore.currentUser.family_id!),
          Query.orderDesc('created_at')
        ]
      );

      // Fetch completed tasks (task history) for this child
      const completedTasksResponse = await databases.listDocuments(
        DATABASE_ID,
        TASK_HISTORY_COLLECTION_ID,
        [
          Query.equal('user_id', $userStore.currentUser.$id),
          Query.equal('family_id', $userStore.currentUser.family_id!),
          Query.orderDesc('completed_at')
        ]
      );

      tasks = tasksResponse.documents as Task[];
      completedTasks = completedTasksResponse.documents as TaskCompletion[];

    } catch (err: any) {
      console.error('Failed to fetch tasks:', err);
      taskError = err.message;
    } finally {
      isLoadingTasks = false;
    }
  }

  async function handleCompleteTask(task: Task) {
    if (!$userStore.currentUser?.family_id) {
      alert('No family context found.');
      return;
    }

    completingTaskId = task.$id;

    try {
      // Create a task completion record
      const taskCompletion = {
        task_id: task.$id,
        user_id: $userStore.currentUser.$id,
        completed_by_user_id: $userStore.currentUser.$id,
        family_id: $userStore.currentUser.family_id,
        completed_at: new Date().toISOString(),
        points_awarded: task.points || 0
      };

      await databases.createDocument(
        DATABASE_ID,
        TASK_HISTORY_COLLECTION_ID,
        'unique()', // Let Appwrite generate the ID
        taskCompletion
      );

      // Update the task status to completed
      await databases.updateDocument(
        DATABASE_ID,
        TASKS_COLLECTION_ID,
        task.$id,
        { 
          status: 'completed',
          updated_at: new Date().toISOString()
        }
      );

      // Refresh the tasks list
      await fetchTasks();

    } catch (err: any) {
      console.error('Failed to complete task:', err);
      alert(`Failed to complete task: ${err.message}`);
    } finally {
      completingTaskId = null;
    }
  }

  function getPriorityColor(priority: string): string {
    switch (priority) {
      case 'high': return '#ff4444';
      case 'medium': return '#ff8800';
      case 'low': return '#44aa44';
      default: return '#666';
    }
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString();
  }
</script>

{#if $userStore.loading}
  <p class="text-center text-gray-600">Loading user data...</p>
{:else if $userStore.currentUser && $userStore.currentUser.role === 'child'}
  <div class="max-w-4xl mx-auto p-8">
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-gray-800 mb-2">My Tasks</h1>
      <p class="text-lg text-gray-600">Welcome, {$userStore.currentUser.name || $userStore.currentUser.email}!</p>
    </div>

    {#if !$userStore.currentUser.family_id}
      <section class="mb-8 p-6 border border-yellow-400 rounded-lg bg-yellow-50">
        <h2 class="text-xl font-semibold text-gray-800 mb-4">No Family Group</h2>
        <p class="text-gray-700 mb-2">You need to be invited to a family group by a parent to see your tasks.</p>
        <p class="text-gray-700">Ask a parent to invite you to their family group.</p>
      </section>
    {:else}
      <!-- Pending Tasks Section -->
      <section class="mb-8 p-6 border border-gray-200 rounded-lg">
        <h2 class="text-2xl font-semibold text-gray-800 mb-6">Tasks to Complete</h2>
        {#if isLoadingTasks}
          <p class="text-center text-gray-600">Loading your tasks...</p>
        {:else if taskError}
          <p class="text-red-600">Error loading tasks: {taskError}</p>
        {:else}
          {#each tasks.filter(t => t.status === 'pending') as task (task.$id)}
            <div class="border border-gray-300 rounded-lg p-6 mb-4 bg-white border-l-4 border-l-blue-600">
              <div class="flex justify-between items-center mb-3">
                <h3 class="text-lg font-semibold text-gray-800">{task.title}</h3>
                <span class="px-3 py-1 rounded-full text-xs font-bold uppercase text-white {task.priority === 'high' ? 'bg-red-500' : task.priority === 'medium' ? 'bg-yellow-500' : 'bg-green-500'}">
                  {task.priority}
                </span>
              </div>
              {#if task.description}
                <p class="text-gray-600 italic mb-3">{task.description}</p>
              {/if}
              <div class="flex gap-4 mb-4 text-sm text-gray-500">
                {#if task.due_date}
                  <span class="text-orange-600">Due: {formatDate(task.due_date)}</span>
                {/if}
                {#if task.points}
                  <span class="text-blue-600 font-bold">Points: {task.points}</span>
                {/if}
              </div>
              <button 
                class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors font-bold"
                on:click={() => handleCompleteTask(task)}
                disabled={completingTaskId === task.$id}
              >
                {#if completingTaskId === task.$id}
                  Completing...
                {:else}
                  Mark Complete
                {/if}
              </button>
            </div>
          {:else}
            <p class="text-center text-gray-500 italic py-8">Great job! You have no pending tasks.</p>
          {/each}
        {/if}
      </section>

      <!-- Completed Tasks Section -->
      <section class="mb-8 p-6 border border-gray-200 rounded-lg">
        <h2 class="text-2xl font-semibold text-gray-800 mb-6">Recently Completed Tasks</h2>
        {#if isLoadingTasks}
          <p class="text-center text-gray-600">Loading completed tasks...</p>
        {:else if completedTasks.length > 0}
          {#each completedTasks.slice(0, 5) as completion (completion.$id)}
            {@const completedTask = tasks.find(t => t.$id === completion.task_id)}
            <div class="border border-gray-300 rounded-lg p-6 mb-4 bg-white border-l-4 border-l-green-600 opacity-80">
              <div class="flex justify-between items-center mb-3">
                <h3 class="text-lg font-semibold text-gray-800">{completedTask?.title || 'Task not found'}</h3>
                <span class="text-green-600 font-bold text-sm">✓ Completed</span>
              </div>
              <div class="flex gap-4 text-sm text-gray-500">
                <span class="text-gray-600">Completed: {formatDate(completion.completed_at)}</span>
                {#if completion.points_awarded}
                  <span class="text-green-600 font-bold">+{completion.points_awarded} points</span>
                {/if}
              </div>
            </div>
          {:else}
            <p class="text-center text-gray-500 italic py-8">No completed tasks yet. Start completing tasks above!</p>
          {/each}
        {:else}
          <p class="text-center text-gray-500 italic py-8">No completed tasks yet. Start completing tasks above!</p>
        {/if}
      </section>
    {/if}
  </div>
{:else}
  <p class="text-center text-gray-600">You do not have permission to view this page or are not logged in.</p>
{/if} 