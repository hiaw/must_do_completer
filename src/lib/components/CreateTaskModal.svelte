<script lang="ts">
  import { databases } from "$lib/appwrite"
  import { userStore, type UserProfile } from "$lib/stores/userStore"
  import { createEventDispatcher } from "svelte"

  const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || "must_dos_db"
  const TASKS_COLLECTION_ID =
    import.meta.env.VITE_APPWRITE_TASKS_COLLECTION_ID || "tasks"

  export let isOpen = false
  export let children: UserProfile[] = []
  export let isLoadingChildren = false
  export let childrenError: string | null = null

  // Task creation form fields
  let taskTitle = ""
  let taskDescription = ""
  let assignedToUserId = ""
  let taskPriority: "low" | "medium" | "high" = "medium"
  let taskPoints = 10
  let taskDueDate = ""
  let isCreatingTask = false
  let createTaskError: string | null = null
  let createTaskSuccess: string | null = null

  const dispatch = createEventDispatcher()

  function closeModal() {
    resetForm()
    dispatch("close")
  }

  function resetForm() {
    taskTitle = ""
    taskDescription = ""
    assignedToUserId = ""
    taskPriority = "medium"
    taskPoints = 10
    taskDueDate = ""
    createTaskError = null
    createTaskSuccess = null
  }

  async function handleCreateTask() {
    if (!$userStore.currentUser?.family_id) {
      createTaskError = "No family context found."
      return
    }
    if (!taskTitle.trim() || !assignedToUserId) {
      createTaskError = "Task title and assigned child are required."
      return
    }

    isCreatingTask = true
    createTaskError = null
    createTaskSuccess = null

    try {
      const taskData = {
        title: taskTitle.trim(),
        description: taskDescription.trim() || "",
        assigned_to_user_id: assignedToUserId,
        created_by_user_id: $userStore.currentUser.$id,
        family_id: $userStore.currentUser.family_id,
        status: "pending",
        priority: taskPriority,
        points: taskPoints,
        due_date: taskDueDate || undefined,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const newTask = await databases.createDocument(
        DATABASE_ID,
        TASKS_COLLECTION_ID,
        "unique()",
        taskData,
      )

      console.log("Task created successfully:", newTask)
      createTaskSuccess = `Task "${taskTitle}" assigned to child successfully!`

      // Dispatch success event to parent component
      dispatch("taskCreated", newTask)

      // Close the modal after successful creation
      setTimeout(() => {
        closeModal()
      }, 1500) // Give time to show success message
    } catch (err: any) {
      console.error("Failed to create task:", err)
      createTaskError =
        err.message || "An unknown error occurred while creating the task."
    } finally {
      isCreatingTask = false
    }
  }

  // Reset form when modal opens
  $: if (isOpen) {
    resetForm()
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
  >
    <div
      class="bg-white rounded-lg p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
    >
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-2xl font-bold text-gray-800">Create New Task</h3>
        <button
          type="button"
          on:click={closeModal}
          class="text-gray-500 hover:text-gray-700 text-2xl"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <form on:submit|preventDefault={handleCreateTask}>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label
              for="modalTaskTitle"
              class="block mb-2 font-bold text-gray-700">Title:</label
            >
            <input
              type="text"
              id="modalTaskTitle"
              bind:value={taskTitle}
              required
              disabled={isCreatingTask}
              class="w-full px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label
              for="modalAssignTo"
              class="block mb-2 font-bold text-gray-700">Assign to Child:</label
            >
            {#if isLoadingChildren}
              <p class="text-gray-600 italic">Loading children...</p>
            {:else if children.length > 0}
              <select
                id="modalAssignTo"
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
              <p class="text-red-600">
                No children found. <a
                  href="/parent/family"
                  class="text-blue-600 hover:underline"
                  >Add children to your family</a
                >
              </p>
            {/if}
            {#if childrenError}
              <p class="text-red-600 text-sm">
                Error loading children: {childrenError}
              </p>
            {/if}
          </div>
        </div>

        <div class="mb-4">
          <label
            for="modalTaskDescription"
            class="block mb-2 font-bold text-gray-700"
            >Description (optional):</label
          >
          <textarea
            id="modalTaskDescription"
            bind:value={taskDescription}
            disabled={isCreatingTask}
            class="w-full px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-20 resize-y"
          ></textarea>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label
              for="modalTaskPriority"
              class="block mb-2 font-bold text-gray-700">Priority:</label
            >
            <select
              id="modalTaskPriority"
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
            <label
              for="modalTaskPoints"
              class="block mb-2 font-bold text-gray-700">Points:</label
            >
            <input
              type="number"
              id="modalTaskPoints"
              bind:value={taskPoints}
              min="0"
              max="100"
              disabled={isCreatingTask}
              class="w-full px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label
              for="modalTaskDueDate"
              class="block mb-2 font-bold text-gray-700"
              >Due Date (optional):</label
            >
            <input
              type="date"
              id="modalTaskDueDate"
              bind:value={taskDueDate}
              disabled={isCreatingTask}
              class="w-full px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {#if createTaskSuccess}
          <p class="text-green-600 text-sm mb-4 font-bold">
            {createTaskSuccess}
          </p>
        {/if}
        {#if createTaskError}
          <p class="text-red-600 text-sm mb-4">{createTaskError}</p>
        {/if}

        <div class="flex gap-4 justify-end pt-4 border-t border-gray-200">
          <button
            type="button"
            on:click={closeModal}
            disabled={isCreatingTask}
            class="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isCreatingTask ||
              isLoadingChildren ||
              children.length === 0}
            class="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {#if isCreatingTask}Creating Task...{:else}Create Task{/if}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
