<script lang="ts">
  import { onMount } from "svelte"
  import { userStore } from "$lib/stores/userStore"
  import { goto } from "$app/navigation"
  import { databases } from "$lib/appwrite"
  import { Query } from "appwrite"

  // Environment variables for database collections
  const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || "must_dos_db"
  const TASKS_COLLECTION_ID =
    import.meta.env.VITE_APPWRITE_TASKS_COLLECTION_ID || "tasks"
  const TASK_HISTORY_COLLECTION_ID =
    import.meta.env.VITE_APPWRITE_TASK_HISTORY_COLLECTION_ID || "task_history"

  // Types
  interface Task {
    $id: string
    title: string
    description?: string
    assigned_to_user_id: string
    created_by_user_id: string
    family_id: string
    status: "pending" | "completed"
    due_date?: string
    points?: number
    priority: "low" | "medium" | "high"
    created_at?: string
    updated_at?: string
  }

  interface TaskCompletion {
    $id: string
    task_id: string
    user_id: string
    family_id: string
    completed_at: string
    verified_by_parent?: string
    points_awarded?: number
  }

  interface EnrichedTaskCompletion extends TaskCompletion {
    task?: Task // Include task details
  }

  // State
  let pendingTasks: Task[] = []
  let completedTasks: EnrichedTaskCompletion[] = []
  let isLoadingTasks = true
  let taskError: string | null = null
  let completingTaskId: string | null = null

  // Cache for performance
  let lastFetchTime = 0
  const CACHE_DURATION = 30000 // 30 seconds cache

  // Guard to prevent duplicate fetches
  let isFetching = false

  onMount(() => {
    const unsubscribe = userStore.subscribe(async (value) => {
      if (value.loading) return

      if (!value.currentUser || value.currentUser.role !== "child") {
        goto("/login")
        return
      }

      if (value.currentUser.family_id && !isFetching) {
        await fetchTasksOptimized()
      }
    })
    return unsubscribe
  })

  async function fetchTasksOptimized() {
    if (!$userStore.currentUser || isFetching) return

    // Check cache
    const now = Date.now()
    if (
      now - lastFetchTime < CACHE_DURATION &&
      (pendingTasks.length > 0 || completedTasks.length > 0)
    ) {
      return // Use cached data
    }

    isFetching = true
    isLoadingTasks = true
    taskError = null

    try {
      const userId = $userStore.currentUser.$id
      const familyId = $userStore.currentUser.family_id!

      // Parallel queries for better performance
      const [tasksResponse, completedTasksResponse] = await Promise.all([
        // Only fetch pending tasks for the main view
        databases.listDocuments(DATABASE_ID, TASKS_COLLECTION_ID, [
          Query.equal("assigned_to_user_id", userId),
          Query.equal("family_id", familyId),
          Query.equal("status", "pending"),
          Query.orderDesc("created_at"),
          Query.limit(50), // Limit for performance
        ]),
        // Fetch recent completed tasks with limit
        databases.listDocuments(DATABASE_ID, TASK_HISTORY_COLLECTION_ID, [
          Query.equal("user_id", userId),
          Query.equal("family_id", familyId),
          Query.orderDesc("completed_at"),
          Query.limit(10), // Only get recent completions
        ]),
      ])

      pendingTasks = tasksResponse.documents as unknown as Task[]

      // Get task IDs from completed tasks to fetch their details efficiently
      const completedTaskIds = (
        completedTasksResponse.documents as unknown as TaskCompletion[]
      )
        .map((completion) => completion.task_id)
        .filter((id, index, arr) => arr.indexOf(id) === index) // Remove duplicates

      // Fetch completed task details in one query if we have any
      let completedTaskDetails: Task[] = []
      if (completedTaskIds.length > 0) {
        const completedTasksDetailsResponse = await databases.listDocuments(
          DATABASE_ID,
          TASKS_COLLECTION_ID,
          [Query.equal("$id", completedTaskIds), Query.limit(10)],
        )
        completedTaskDetails =
          completedTasksDetailsResponse.documents as unknown as Task[]
      }

      // Enrich completed tasks with task details
      completedTasks = (
        completedTasksResponse.documents as unknown as TaskCompletion[]
      ).map((completion) => ({
        ...completion,
        task: completedTaskDetails.find(
          (task) => task.$id === completion.task_id,
        ),
      }))

      lastFetchTime = now
    } catch (err: any) {
      console.error("Failed to fetch tasks:", err)
      taskError = err.message
    } finally {
      isLoadingTasks = false
      isFetching = false
    }
  }

  async function handleCompleteTask(task: Task) {
    if (!$userStore.currentUser?.family_id) {
      alert("No family context found.")
      return
    }

    completingTaskId = task.$id

    try {
      const taskCompletion = {
        task_id: task.$id,
        user_id: $userStore.currentUser.$id,
        completed_by_user_id: $userStore.currentUser.$id,
        family_id: $userStore.currentUser.family_id,
        completed_at: new Date().toISOString(),
        points_awarded: task.points || 0,
      }

      // Parallel operations for better performance
      const [completionDoc] = await Promise.all([
        databases.createDocument(
          DATABASE_ID,
          TASK_HISTORY_COLLECTION_ID,
          "unique()",
          taskCompletion,
        ),
        databases.updateDocument(DATABASE_ID, TASKS_COLLECTION_ID, task.$id, {
          status: "completed",
          updated_at: new Date().toISOString(),
        }),
      ])

      // Optimistic update - update local state immediately
      pendingTasks = pendingTasks.filter((t) => t.$id !== task.$id)

      // Add to completed tasks at the beginning
      const enrichedCompletion: EnrichedTaskCompletion = {
        ...taskCompletion,
        $id: completionDoc.$id,
        task: { ...task, status: "completed" },
      }
      completedTasks = [enrichedCompletion, ...completedTasks.slice(0, 9)] // Keep only 10 recent

      // Update cache timestamp
      lastFetchTime = Date.now()
    } catch (err: any) {
      console.error("Failed to complete task:", err)
      alert(`Failed to complete task: ${err.message}`)

      // Refresh data on error to ensure consistency
      await fetchTasksOptimized()
    } finally {
      completingTaskId = null
    }
  }

  function getPriorityColor(priority: string): string {
    switch (priority) {
      case "high":
        return "#ff4444"
      case "medium":
        return "#ff8800"
      case "low":
        return "#44aa44"
      default:
        return "#666"
    }
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString()
  }

  // Refresh function for manual refresh
  async function refreshTasks() {
    if (isFetching) return // Prevent duplicate calls
    lastFetchTime = 0 // Clear cache
    await fetchTasksOptimized()
  }
</script>

{#if $userStore.loading}
  <p class="text-center text-gray-600">Loading user data...</p>
{:else if $userStore.currentUser && $userStore.currentUser.role === "child"}
  <div class="max-w-4xl mx-auto p-8">
    <div class="mb-8 flex justify-between items-center">
      <div>
        <h1 class="text-3xl font-bold text-gray-800 mb-2">My Tasks</h1>
        <p class="text-lg text-gray-600">
          Welcome, {$userStore.currentUser.name ||
            $userStore.currentUser.email}!
        </p>
      </div>
      <button
        on:click={refreshTasks}
        disabled={isLoadingTasks}
        class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
      >
        {#if isLoadingTasks}Refreshing...{:else}Refresh{/if}
      </button>
    </div>

    {#if !$userStore.currentUser.family_id}
      <section
        class="mb-8 p-6 border border-yellow-400 rounded-lg bg-yellow-50"
      >
        <h2 class="text-xl font-semibold text-gray-800 mb-4">
          No Family Group
        </h2>
        <p class="text-gray-700 mb-2">
          You need to be invited to a family group by a parent to see your
          tasks.
        </p>
        <p class="text-gray-700">
          Ask a parent to invite you to their family group.
        </p>
      </section>
    {:else}
      <!-- Pending Tasks Section -->
      <section class="mb-8 p-6 border border-gray-200 rounded-lg">
        <h2 class="text-2xl font-semibold text-gray-800 mb-6">
          Tasks to Complete
        </h2>
        {#if isLoadingTasks}
          <p class="text-center text-gray-600">Loading your tasks...</p>
        {:else if taskError}
          <p class="text-red-600">Error loading tasks: {taskError}</p>
          <button
            on:click={refreshTasks}
            class="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
          >
            Try Again
          </button>
        {:else if pendingTasks.length > 0}
          {#each pendingTasks as task (task.$id)}
            <div
              class="border border-gray-300 rounded-lg p-6 mb-4 bg-white border-l-4 border-l-blue-600"
            >
              <div class="flex justify-between items-center mb-3">
                <h3 class="text-lg font-semibold text-gray-800">
                  {task.title}
                </h3>
                <span
                  class="px-3 py-1 rounded-full text-xs font-bold uppercase text-white {task.priority ===
                  'high'
                    ? 'bg-red-500'
                    : task.priority === 'medium'
                      ? 'bg-yellow-500'
                      : 'bg-green-500'}"
                >
                  {task.priority}
                </span>
              </div>
              {#if task.description}
                <p class="text-gray-600 italic mb-3">{task.description}</p>
              {/if}
              <div class="flex gap-4 mb-4 text-sm text-gray-500">
                {#if task.due_date}
                  <span class="text-orange-600"
                    >Due: {formatDate(task.due_date)}</span
                  >
                {/if}
                {#if task.points}
                  <span class="text-blue-600 font-bold"
                    >Points: {task.points}</span
                  >
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
          {/each}
        {:else}
          <p class="text-center text-gray-500 italic py-8">
            Great job! You have no pending tasks.
          </p>
        {/if}
      </section>

      <!-- Completed Tasks Section -->
      <section class="mb-8 p-6 border border-gray-200 rounded-lg">
        <h2 class="text-2xl font-semibold text-gray-800 mb-6">
          Recently Completed Tasks
        </h2>
        {#if isLoadingTasks}
          <p class="text-center text-gray-600">Loading completed tasks...</p>
        {:else if completedTasks.length > 0}
          {#each completedTasks as completion (completion.$id)}
            <div
              class="border border-gray-300 rounded-lg p-6 mb-4 bg-white border-l-4 border-l-green-600 opacity-80"
            >
              <div class="flex justify-between items-center mb-3">
                <h3 class="text-lg font-semibold text-gray-800">
                  {completion.task?.title || "Task not found"}
                </h3>
                <span class="text-green-600 font-bold text-sm">✓ Completed</span
                >
              </div>
              <div class="flex gap-4 text-sm text-gray-500">
                <span class="text-gray-600"
                  >Completed: {formatDate(completion.completed_at)}</span
                >
                {#if completion.points_awarded}
                  <span class="text-green-600 font-bold"
                    >+{completion.points_awarded} points</span
                  >
                {/if}
              </div>
            </div>
          {/each}
        {:else}
          <p class="text-center text-gray-500 italic py-8">
            No completed tasks yet. Start completing tasks above!
          </p>
        {/if}
      </section>
    {/if}
  </div>
{:else}
  <p class="text-center text-gray-600">
    You do not have permission to view this page or are not logged in.
  </p>
{/if}
