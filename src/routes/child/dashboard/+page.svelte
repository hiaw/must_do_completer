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
  <p>Loading user data...</p>
{:else if $userStore.currentUser && $userStore.currentUser.role === 'child'}
  <h1>My Tasks</h1>
  <p>Welcome, {$userStore.currentUser.name || $userStore.currentUser.email}!</p>

  {#if !$userStore.currentUser.family_id}
    <section class="no-family-section">
      <h2>No Family Group</h2>
      <p>You need to be invited to a family group by a parent to see your tasks.</p>
      <p>Ask a parent to invite you to their family group.</p>
    </section>
  {:else}
    <!-- Pending Tasks Section -->
    <section>
      <h2>Tasks to Complete</h2>
      {#if isLoadingTasks}
        <p>Loading your tasks...</p>
      {:else if taskError}
        <p style="color: red;">Error loading tasks: {taskError}</p>
      {:else}
        {#each tasks.filter(t => t.status === 'pending') as task (task.$id)}
          <div class="task-card pending-task">
            <div class="task-header">
              <h3>{task.title}</h3>
              <span class="priority-badge" style="background-color: {getPriorityColor(task.priority)}">
                {task.priority}
              </span>
            </div>
            {#if task.description}
              <p class="task-description">{task.description}</p>
            {/if}
            <div class="task-meta">
              {#if task.due_date}
                <span class="due-date">Due: {formatDate(task.due_date)}</span>
              {/if}
              {#if task.points}
                <span class="points">Points: {task.points}</span>
              {/if}
            </div>
            <button 
              class="complete-btn"
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
          <p class="no-tasks">Great job! You have no pending tasks.</p>
        {/each}
      {/if}
    </section>

    <!-- Completed Tasks Section -->
    <section>
      <h2>Recently Completed Tasks</h2>
      {#if isLoadingTasks}
        <p>Loading completed tasks...</p>
      {:else if completedTasks.length > 0}
        {#each completedTasks.slice(0, 5) as completion (completion.$id)}
          {@const completedTask = tasks.find(t => t.$id === completion.task_id)}
          <div class="task-card completed-task">
            <div class="task-header">
              <h3>{completedTask?.title || 'Task not found'}</h3>
              <span class="completed-badge">✓ Completed</span>
            </div>
            <div class="task-meta">
              <span class="completion-date">Completed: {formatDate(completion.completed_at)}</span>
              {#if completion.points_awarded}
                <span class="points-earned">+{completion.points_awarded} points</span>
              {/if}
            </div>
          </div>
        {:else}
          <p class="no-tasks">No completed tasks yet. Start completing tasks above!</p>
        {/each}
      {:else}
        <p class="no-tasks">No completed tasks yet. Start completing tasks above!</p>
      {/if}
    </section>
  {/if}
{:else}
  <p>You do not have permission to view this page or are not logged in.</p>
{/if}

<style>
  section {
    margin-bottom: 2rem;
    padding: 1rem;
    border: 1px solid #eee;
    border-radius: 8px;
  }

  .no-family-section {
    background-color: #fff9e6;
    border-color: #ffd700;
  }

  .task-card {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
    background-color: #fff;
  }

  .pending-task {
    border-left: 4px solid #007bff;
  }

  .completed-task {
    border-left: 4px solid #28a745;
    opacity: 0.8;
  }

  .task-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .task-header h3 {
    margin: 0;
    color: #333;
  }

  .priority-badge {
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: bold;
    text-transform: uppercase;
  }

  .completed-badge {
    color: #28a745;
    font-weight: bold;
    font-size: 0.875rem;
  }

  .task-description {
    color: #666;
    margin: 0.5rem 0;
    font-style: italic;
  }

  .task-meta {
    display: flex;
    gap: 1rem;
    margin: 0.5rem 0;
    font-size: 0.875rem;
    color: #888;
  }

  .due-date {
    color: #ff6600;
  }

  .points {
    color: #007bff;
    font-weight: bold;
  }

  .points-earned {
    color: #28a745;
    font-weight: bold;
  }

  .completion-date {
    color: #666;
  }

  .complete-btn {
    background-color: #28a745;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
  }

  .complete-btn:hover:not(:disabled) {
    background-color: #218838;
  }

  .complete-btn:disabled {
    background-color: #6c757d;
    cursor: not-allowed;
  }

  .no-tasks {
    text-align: center;
    color: #888;
    font-style: italic;
    padding: 2rem;
  }
</style> 