<script lang="ts">
  import { onMount } from "svelte"
  import {
    userStore,
    type UserProfile,
    loadUser,
    loadUserBasic,
  } from "$lib/stores/userStore"
  import { goto } from "$app/navigation"
  import { databases, teams } from "$lib/appwrite"
  import { Query, ID } from "appwrite"
  import CreateTaskModal from "$lib/components/CreateTaskModal.svelte"
  import TaskList from "$lib/components/TaskList.svelte"
  import CreateRecurringTaskModal from "$lib/components/CreateRecurringTaskModal.svelte" // Import new modal
  import type { RecurringTask } from "$lib/types" // Import RecurringTask type

  const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || "must_dos_db"
  const USERS_EXTENDED_COLLECTION_ID =
    import.meta.env.VITE_APPWRITE_USERS_EXTENDED_COLLECTION_ID ||
    "users_extended"
  const TASKS_COLLECTION_ID =
    import.meta.env.VITE_APPWRITE_TASKS_COLLECTION_ID || "tasks"
  const RECURRING_TASKS_COLLECTION_ID = "recurring_tasks" // Added

  let children: UserProfile[] = []
  let isLoadingChildren = true
  let childrenError: string | null = null

  // Create task modal
  let isCreateTaskModalOpen = false
  let isCreateRecurringTaskModalOpen = false // New state for recurring task modal

  // Task listing
  let allTasks: any[] = []
  let isLoadingTasks = false
  let tasksError: string | null = null

  let recurringTasks: RecurringTask[] = [] // New state for recurring tasks
  let isLoadingRecurringTasks = false // New loading state
  let recurringTasksError: string | null = null // New error state

  // Family creation
  let familyName = ""
  let isCreatingFamily = false
  let createFamilyError: string | null = null

  onMount(() => {
    const unsubscribe = userStore.subscribe(async (value) => {
      if (value.loading) {
        return
      }

      if (!value.currentUser || value.currentUser.role !== "parent") {
        goto("/login")
      } else if (value.currentUser.family_id) {
        await fetchChildren(value.currentUser.family_id)
        await fetchAllTasks()
        await fetchRecurringTasks() // Fetch recurring tasks
      }
    })
    return unsubscribe
  })

  async function fetchChildren(familyTeamId: string) {
    isLoadingChildren = true
    childrenError = null
    try {
      const userProfilesResponse = await databases.listDocuments(
        DATABASE_ID,
        USERS_EXTENDED_COLLECTION_ID,
        [
          Query.equal("family_id", familyTeamId),
          Query.equal("role", "child"),
          Query.limit(50),
        ],
      )

      children = userProfilesResponse.documents.map((doc: any) => ({
        $id: doc.user_id,
        name: doc.name || "Unnamed User",
        email: doc.email || "No email available",
        prefs: {},
        role: "child" as const,
        family_id: familyTeamId,
        $databaseId: doc.$id,
        $collectionId: doc.$collectionId,
      }))
    } catch (err: any) {
      console.error("Failed to fetch children:", err)
      childrenError = err.message
    } finally {
      isLoadingChildren = false
    }
  }

  async function fetchAllTasks() {
    if (!$userStore.currentUser?.family_id) return

    isLoadingTasks = true
    tasksError = null

    try {
      const tasksResponse = await databases.listDocuments(
        DATABASE_ID,
        TASKS_COLLECTION_ID,
        [
          Query.equal("family_id", $userStore.currentUser.family_id),
          Query.orderDesc("created_at"),
        ],
      )

      allTasks = tasksResponse.documents
    } catch (err: any) {
      console.error("Failed to fetch tasks:", err)
      tasksError = err.message
    } finally {
      isLoadingTasks = false
    }
  }

  async function fetchRecurringTasks() {
    if (!$userStore.currentUser?.family_id) return
    isLoadingRecurringTasks = true
    recurringTasksError = null
    try {
      const response = await databases.listDocuments(
        DATABASE_ID!,
        RECURRING_TASKS_COLLECTION_ID,
        [
          Query.equal("family_id", $userStore.currentUser.family_id),
          Query.orderDesc("$createdAt"),
        ],
      )
      // Enrich with child names if possible (optional, for display)
      recurringTasks = response.documents.map((doc: any) => {
        const child = children.find((c) => c.$id === doc.assigned_to_user_id)
        return {
          ...doc,
          assigned_to_user_name: child?.name || child?.email || "N/A",
        }
      }) as RecurringTask[]
    } catch (err: any) {
      console.error("Failed to fetch recurring tasks:", err)
      recurringTasksError = err.message
    } finally {
      isLoadingRecurringTasks = false
    }
  }

  async function handleCreateFamily() {
    if (!familyName.trim()) {
      createFamilyError = "Family name is required."
      return
    }
    if (
      !$userStore.currentUser ||
      !$userStore.currentUser.$id ||
      !$userStore.currentUser.$databaseId
    ) {
      createFamilyError =
        "Current user data is incomplete. Cannot create family."
      return
    }

    isCreatingFamily = true
    createFamilyError = null

    try {
      const newTeam = await teams.create(ID.unique(), familyName.trim(), [
        "owner",
        "parent",
      ])

      await databases.updateDocument(
        DATABASE_ID,
        USERS_EXTENDED_COLLECTION_ID,
        $userStore.currentUser.$databaseId,
        { family_id: newTeam.$id },
      )

      // Use full loadUser() here to sync team membership after family creation
      await loadUser()
      familyName = ""
    } catch (err: any) {
      console.error("Failed to create family:", err)
      createFamilyError =
        err.message || "An unknown error occurred while creating the family."
    } finally {
      isCreatingFamily = false
    }
  }

  function openCreateTaskModal() {
    isCreateTaskModalOpen = true
  }

  function openCreateRecurringTaskModal() {
    // New function
    isCreateRecurringTaskModalOpen = true
  }

  function handleTaskCreated(event: CustomEvent) {
    // Refresh the task list when a new task is created
    fetchAllTasks()
  }

  function handleModalClose() {
    isCreateTaskModalOpen = false
  }

  function handleRecurringTaskModalClose() {
    // New function
    isCreateRecurringTaskModalOpen = false
  }

  function handleRecurringTaskCreated() {
    // New function
    fetchRecurringTasks() // Refresh the list
  }
</script>

{#if $userStore.loading}
  <p class="text-center text-gray-600">Loading user data...</p>
{:else if $userStore.currentUser && $userStore.currentUser.role === "parent"}
  <div class="max-w-6xl mx-auto p-8">
    <div
      class="flex flex-col md:flex-row md:justify-between md:items-center mb-8 pb-4 border-b-2 border-gray-200"
    >
      <h1 class="text-3xl font-bold text-gray-800 mb-4 md:mb-0">
        Parent Dashboard
      </h1>
      <nav class="flex gap-4">
        <a
          href="/parent/family"
          class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors font-medium"
        >
          Manage Family
        </a>
      </nav>
    </div>

    <div class="mb-8 p-6 border border-gray-200 rounded-lg bg-gray-50">
      <p class="text-lg text-center">
        Welcome, <span class="font-bold text-blue-600">
          {$userStore.currentUser.name || $userStore.currentUser.email}
        </span>!
      </p>
      <p class="text-sm text-gray-600 text-center mt-2">
        Manage your family and tasks from this dashboard.
        <a href="/parent/family" class="text-blue-600 hover:underline">
          Edit your profile and family settings
        </a>
      </p>
    </div>

    {#if !$userStore.currentUser.family_id}
      <section
        class="bg-gray-50 border border-gray-300 rounded-lg p-8 text-center mb-8"
      >
        <h2 class="text-2xl font-semibold text-gray-800 mb-4">
          Create Your Family Group
        </h2>
        <p class="text-gray-600 mb-8">
          To start managing tasks, you need to create a family group.
        </p>
        <form
          on:submit|preventDefault={handleCreateFamily}
          class="max-w-md mx-auto"
        >
          <div class="mb-4 text-left">
            <label for="familyName" class="block mb-2 font-bold text-gray-700"
              >Family Name:</label
            >
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
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-2xl font-semibold text-gray-800">Tasks</h2>
          <div class="flex gap-2">
            {#if children.length > 0}
              <button
                type="button"
                on:click={openCreateTaskModal}
                class="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-bold text-sm"
              >
                + Create Single Task
              </button>
              <button
                type="button"
                on:click={openCreateRecurringTaskModal}
                class="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-bold text-sm"
              >
                + Create Recurring Task
              </button>
            {:else}
              <p class="text-red-600 text-sm">
                <a href="/parent/family" class="text-blue-600 hover:underline"
                  >Add children to your family</a
                >
                to create tasks.
              </p>
            {/if}
          </div>
        </div>
        {#if isLoadingChildren}
          <p class="text-gray-600 italic mt-4">Loading children...</p>
        {:else if childrenError}
          <p class="text-red-600 text-sm mt-4">
            Error loading children: {childrenError}
          </p>
        {/if}
      </section>

      <TaskList
        tasks={allTasks}
        {children}
        isLoading={isLoadingTasks}
        error={tasksError}
      />
    {/if}

    <!-- Recurring Tasks Section -->
    {#if $userStore.currentUser?.family_id}
      <section class="bg-white border border-gray-200 rounded-lg p-8 mb-8 mt-8">
        <h2
          class="text-2xl font-semibold text-gray-800 mb-6 pb-2 border-b-2 border-green-600"
        >
          Recurring Task Templates
        </h2>
        {#if isLoadingRecurringTasks}
          <p class="text-gray-600 italic">
            Loading recurring task templates...
          </p>
        {:else if recurringTasksError}
          <p class="text-red-600">
            Error loading recurring templates: {recurringTasksError}
          </p>
        {:else if recurringTasks.length > 0}
          <div
            class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4"
          >
            {#each recurringTasks as rt (rt.$id)}
              <div
                class="border border-gray-300 rounded-lg p-6 bg-white shadow-sm hover:shadow-md transition-shadow border-l-4 border-l-green-600"
              >
                <div class="flex justify-between items-start mb-4">
                  <h3 class="text-lg font-semibold text-gray-800 flex-1">
                    {rt.title}
                  </h3>
                  <span
                    class="px-3 py-1 rounded-full text-xs font-bold uppercase
                  {rt.is_active
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-400 text-gray-700'}"
                  >
                    {rt.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                {#if rt.description}
                  <p
                    class="text-gray-600 italic mb-4 leading-relaxed truncate max-h-20 overflow-hidden"
                  >
                    {rt.description}
                  </p>
                {/if}
                <div class="mt-4 space-y-2 text-sm">
                  <p>
                    <strong class="text-gray-600">Assigned to:</strong>
                    {rt.assigned_to_user_name || rt.assigned_to_user_id}
                  </p>
                  <p>
                    <strong class="text-gray-600">Repeats:</strong>
                    <span class="capitalize">{rt.recurrence_type}</span>
                    {#if rt.recurrence_type === "weekly" && rt.recurrence_details}
                      (on
                      {#if rt.recurrence_details === "0"}
                        Sunday
                      {:else if rt.recurrence_details === "1"}
                        Monday
                      {:else if rt.recurrence_details === "2"}
                        Tuesday
                      {:else if rt.recurrence_details === "3"}
                        Wednesday
                      {:else if rt.recurrence_details === "4"}
                        Thursday
                      {:else if rt.recurrence_details === "5"}
                        Friday
                      {:else if rt.recurrence_details === "6"}
                        Saturday
                      {/if}
                      )
                    {/if}
                  </p>
                  <p>
                    <strong class="text-gray-600">Points:</strong>
                    {rt.points}
                  </p>
                  <p>
                    <strong class="text-gray-600">Starts:</strong>
                    {new Date(rt.start_date).toLocaleDateString()}
                  </p>
                  {#if rt.end_date}
                    <p>
                      <strong class="text-gray-600">Ends:</strong>
                      {new Date(rt.end_date).toLocaleDateString()}
                    </p>
                  {/if}
                  {#if rt.last_generated_at}
                    <p>
                      <strong class="text-gray-600">Last Generated:</strong>
                      {new Date(rt.last_generated_at).toLocaleString()}
                    </p>
                  {/if}
                </div>
                <!-- TODO: Add Edit/Delete buttons for recurring tasks -->
              </div>
            {/each}
          </div>
        {:else}
          <div
            class="text-center text-gray-500 py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300"
          >
            <p class="mb-2">No recurring task templates created yet.</p>
            <p>Click the "+ Create Recurring Task" button to add one.</p>
          </div>
        {/if}
      </section>
    {/if}
  </div>
{:else}
  <p class="text-center text-gray-600">
    You do not have permission to view this page or are not logged in.
  </p>
{/if}

<CreateTaskModal
  isOpen={isCreateTaskModalOpen}
  {children}
  {isLoadingChildren}
  {childrenError}
  on:close={handleModalClose}
  on:taskCreated={handleTaskCreated}
/>

<CreateRecurringTaskModal
  isOpen={isCreateRecurringTaskModalOpen}
  {children}
  {isLoadingChildren}
  {childrenError}
  on:close={handleRecurringTaskModalClose}
  on:recurringTaskCreated={handleRecurringTaskCreated}
/>
