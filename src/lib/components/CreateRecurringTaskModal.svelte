<script lang="ts">
  import { databases } from "$lib/appwrite"
  import { userStore, type UserProfile } from "$lib/stores/userStore"
  import type { RecurringTask } from "$lib/types" // Import the new type
  import { createEventDispatcher } from "svelte"
  import { ID } from "appwrite"

  const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || "must_dos_db"
  const RECURRING_TASKS_COLLECTION_ID = "recurring_tasks"

  export let isOpen = false
  export let children: UserProfile[] = []
  export let isLoadingChildren = false
  export let childrenError: string | null = null

  let recurringTask: RecurringTask = {
    title: "",
    description: "",
    assigned_to_user_id: "",
    created_by_user_id: "", // Will be set from $userStore
    family_id: "", // Will be set from $userStore
    priority: "medium",
    points: 10,
    recurrence_type: "daily",
    recurrence_details: undefined, // e.g. "1" for Monday
    start_date: new Date().toISOString().split("T")[0], // Default to today
    end_date: undefined,
    is_active: true,
  }

  let isCreatingTask = false
  let createTaskError: string | null = null
  let createTaskSuccess: string | null = null

  const dispatch = createEventDispatcher()

  function closeModal() {
    resetForm()
    dispatch("close")
  }

  function resetForm() {
    recurringTask = {
      title: "",
      description: "",
      assigned_to_user_id: "",
      created_by_user_id: "",
      family_id: "",
      priority: "medium",
      points: 10,
      recurrence_type: "daily",
      recurrence_details: undefined,
      start_date: new Date().toISOString().split("T")[0],
      end_date: undefined,
      is_active: true,
    }
    createTaskError = null
    createTaskSuccess = null
  }

  async function handleCreateRecurringTask() {
    if (!$userStore.currentUser?.family_id || !$userStore.currentUser?.$id) {
      createTaskError = "User or family context not found."
      return
    }
    if (!recurringTask.title.trim() || !recurringTask.assigned_to_user_id) {
      createTaskError = "Task title and assigned child are required."
      return
    }
    if (
      recurringTask.recurrence_type === "weekly" &&
      !recurringTask.recurrence_details
    ) {
      createTaskError =
        "Day of the week is required for weekly recurring tasks."
      return
    }

    isCreatingTask = true
    createTaskError = null
    createTaskSuccess = null

    const dataToSave: Omit<
      RecurringTask,
      "$id" | "last_generated_at" | "assigned_to_user_name"
    > = {
      ...recurringTask,
      created_by_user_id: $userStore.currentUser.$id,
      family_id: $userStore.currentUser.family_id,
      // Ensure numeric recurrence_details for weekly tasks if needed by scheduler, otherwise keep as string
      recurrence_details:
        recurringTask.recurrence_type === "weekly"
          ? recurringTask.recurrence_details
          : undefined,
      end_date: recurringTask.end_date || undefined, // Ensure undefined if empty
    }

    try {
      const newTask = await databases.createDocument(
        DATABASE_ID!,
        RECURRING_TASKS_COLLECTION_ID,
        ID.unique(),
        dataToSave,
      )

      createTaskSuccess = `Recurring task "${recurringTask.title}" template created successfully!`
      dispatch("recurringTaskCreated", newTask)
      setTimeout(() => {
        closeModal()
      }, 1500)
    } catch (err: any) {
      console.error("Failed to create recurring task template:", err)
      createTaskError =
        err.message ||
        "An unknown error occurred while creating the recurring task template."
    } finally {
      isCreatingTask = false
    }
  }

  // Reset form when modal opens
  $: if (isOpen) {
    resetForm()
    // Set default start date to today
    if (!recurringTask.start_date) {
      recurringTask.start_date = new Date().toISOString().split("T")[0]
    }
  }

  const daysOfWeek = [
    { value: "0", label: "Sunday" },
    { value: "1", label: "Monday" },
    { value: "2", label: "Tuesday" },
    { value: "3", label: "Wednesday" },
    { value: "4", label: "Thursday" },
    { value: "5", label: "Friday" },
    { value: "6", label: "Saturday" },
  ]
</script>

{#if isOpen}
  <div
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
  >
    <div
      class="bg-white rounded-lg p-6 md:p-8 max-w-2xl w-full mx-auto max-h-[90vh] overflow-y-auto"
    >
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-xl md:text-2xl font-bold text-gray-800">
          Create Recurring Task Template
        </h3>
        <button
          type="button"
          on:click={closeModal}
          class="text-gray-500 hover:text-gray-700 text-2xl"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <form
        on:submit|preventDefault={handleCreateRecurringTask}
        class="space-y-4 md:space-y-6"
      >
        <!-- Task Title -->
        <div>
          <label
            for="recurringTaskTitle"
            class="block mb-2 font-bold text-gray-700">Title:</label
          >
          <input
            type="text"
            id="recurringTaskTitle"
            bind:value={recurringTask.title}
            required
            disabled={isCreatingTask}
            class="w-full px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <!-- Assign to Child -->
        <div>
          <label
            for="recurringAssignTo"
            class="block mb-2 font-bold text-gray-700">Assign to Child:</label
          >
          {#if isLoadingChildren}
            <p class="text-gray-600 italic">Loading children...</p>
          {:else if children.length > 0}
            <select
              id="recurringAssignTo"
              bind:value={recurringTask.assigned_to_user_id}
              required
              disabled={isCreatingTask}
              class="w-full px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="" disabled>Select a child</option>
              {#each children as child (child.$id)}
                <option value={child.$id}>{child.name || child.email}</option>
              {/each}
            </select>
          {:else}
            <p class="text-red-600">
              No children found. <a
                href="/parent/family"
                class="text-blue-600 hover:underline"
                >Add children to your family</a
              >.
            </p>
          {/if}
          {#if childrenError}
            <p class="text-red-600 text-sm">
              Error loading children: {childrenError}
            </p>
          {/if}
        </div>

        <!-- Task Description -->
        <div>
          <label
            for="recurringTaskDescription"
            class="block mb-2 font-bold text-gray-700"
            >Description (optional):</label
          >
          <textarea
            id="recurringTaskDescription"
            bind:value={recurringTask.description}
            disabled={isCreatingTask}
            class="w-full px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[80px] resize-y"
          ></textarea>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Priority -->
          <div>
            <label
              for="recurringTaskPriority"
              class="block mb-2 font-bold text-gray-700">Priority:</label
            >
            <select
              id="recurringTaskPriority"
              bind:value={recurringTask.priority}
              disabled={isCreatingTask}
              class="w-full px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <!-- Points -->
          <div>
            <label
              for="recurringTaskPoints"
              class="block mb-2 font-bold text-gray-700">Points:</label
            >
            <input
              type="number"
              id="recurringTaskPoints"
              bind:value={recurringTask.points}
              min="0"
              max="1000"
              disabled={isCreatingTask}
              class="w-full px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <!-- Recurrence Type -->
        <div>
          <label for="recurrenceType" class="block mb-2 font-bold text-gray-700"
            >Repeats:</label
          >
          <select
            id="recurrenceType"
            bind:value={recurringTask.recurrence_type}
            disabled={isCreatingTask}
            class="w-full px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>

        <!-- Recurrence Details (Day of Week for Weekly) -->
        {#if recurringTask.recurrence_type === "weekly"}
          <div>
            <label
              for="recurrenceDetails"
              class="block mb-2 font-bold text-gray-700">On which day:</label
            >
            <select
              id="recurrenceDetails"
              bind:value={recurringTask.recurrence_details}
              required
              disabled={isCreatingTask}
              class="w-full px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="" disabled>Select a day</option>
              {#each daysOfWeek as day (day.value)}
                <option value={day.value}>{day.label}</option>
              {/each}
            </select>
          </div>
        {/if}

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Start Date -->
          <div>
            <label
              for="recurringStartDate"
              class="block mb-2 font-bold text-gray-700">Start Date:</label
            >
            <input
              type="date"
              id="recurringStartDate"
              bind:value={recurringTask.start_date}
              required
              disabled={isCreatingTask}
              class="w-full px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <!-- End Date -->
          <div>
            <label
              for="recurringEndDate"
              class="block mb-2 font-bold text-gray-700"
              >End Date (optional):</label
            >
            <input
              type="date"
              id="recurringEndDate"
              bind:value={recurringTask.end_date}
              disabled={isCreatingTask}
              class="w-full px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <!-- Is Active Toggle -->
        <div>
          <label
            class="flex items-center space-x-3 mb-2 font-bold text-gray-700"
          >
            <input
              type="checkbox"
              bind:checked={recurringTask.is_active}
              disabled={isCreatingTask}
              class="form-checkbox h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span>Active (new tasks will be generated)</span>
          </label>
        </div>

        {#if createTaskSuccess}
          <p class="text-green-600 text-sm font-bold">{createTaskSuccess}</p>
        {/if}
        {#if createTaskError}
          <p class="text-red-600 text-sm">{createTaskError}</p>
        {/if}

        <div class="flex gap-4 justify-end pt-4 border-t border-gray-200 mt-6">
          <button
            type="button"
            on:click={closeModal}
            disabled={isCreatingTask}
            class="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-400 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isCreatingTask ||
              isLoadingChildren ||
              children.length === 0}
            class="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
          >
            {#if isCreatingTask}Creating Template...{:else}Create Template{/if}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
