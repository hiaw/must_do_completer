<script lang="ts">
  import type { UserProfile } from "$lib/stores/userStore"

  export let tasks: any[] = []
  export let children: UserProfile[] = []
  export let isLoading = false
  export let error: string | null = null
</script>

<section class="bg-white border border-gray-200 rounded-lg p-8 mb-8">
  <h2
    class="text-2xl font-semibold text-gray-800 mb-6 pb-2 border-b-2 border-blue-600"
  >
    All Family Tasks
  </h2>
  {#if isLoading}
    <p class="text-gray-600 italic">Loading tasks...</p>
  {:else if error}
    <p class="text-red-600">Error loading tasks: {error}</p>
  {:else if tasks.length > 0}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
      {#each tasks as task (task.$id)}
        {@const assignedChild = children.find(
          (member) => member.$id === task.assigned_to_user_id,
        )}
        <div
          class="border border-gray-300 rounded-lg p-6 bg-white shadow-sm hover:shadow-md transition-shadow {task.status ===
          'pending'
            ? 'border-l-4 border-l-blue-600'
            : 'border-l-4 border-l-green-600 opacity-90'}"
        >
          <div class="flex justify-between items-start mb-4">
            <h3 class="text-lg font-semibold text-gray-800 flex-1">
              {task.title}
            </h3>
            <div class="flex gap-2 flex-shrink-0">
              <span
                class="px-3 py-1 rounded-full text-xs font-bold uppercase {task.status ===
                'pending'
                  ? 'bg-yellow-400 text-black'
                  : 'bg-green-600 text-white'}"
              >
                {task.status}
              </span>
              <span
                class="px-3 py-1 rounded-full text-xs font-bold uppercase text-white {task.priority ===
                'low'
                  ? 'bg-green-600'
                  : task.priority === 'medium'
                    ? 'bg-yellow-400 text-black'
                    : 'bg-red-600'}"
              >
                {task.priority}
              </span>
            </div>
          </div>

          {#if task.description}
            <p class="text-gray-600 italic mb-4 leading-relaxed">
              {task.description}
            </p>
          {/if}

          <div class="mt-4">
            <div class="flex flex-col gap-2 mb-4">
              <span class="text-sm text-blue-600">
                <strong>Assigned to:</strong>
                {assignedChild?.name || assignedChild?.email || "Unknown"}
              </span>
              <span class="text-sm text-green-600">
                <strong>Points:</strong>
                {task.points}
              </span>
              {#if task.due_date}
                <span class="text-sm text-red-600">
                  <strong>Due:</strong>
                  {new Date(task.due_date).toLocaleDateString()}
                </span>
              {/if}
            </div>

            <div class="flex flex-col gap-1 border-t border-gray-200 pt-3">
              <small class="text-gray-500 text-xs">
                Created: {new Date(task.created_at).toLocaleDateString()}
              </small>
              {#if task.updated_at !== task.created_at}
                <small class="text-gray-500 text-xs">
                  Updated: {new Date(task.updated_at).toLocaleDateString()}
                </small>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div
      class="text-center text-gray-500 py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300"
    >
      <p class="mb-2">No tasks created yet.</p>
      <p>Create your first task above to get started!</p>
    </div>
  {/if}
</section>
