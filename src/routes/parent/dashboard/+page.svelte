<script lang="ts">
  import { onMount } from "svelte"
  import { userStore, type UserProfile, loadUser } from "$lib/stores/userStore"
  import { goto } from "$app/navigation"
  import { teams, databases } from "$lib/appwrite"
  import { Query, ID } from "appwrite"
  import CreateTaskModal from "$lib/components/CreateTaskModal.svelte"
  import TaskList from "$lib/components/TaskList.svelte"

  const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || "must_dos_db"
  const USERS_EXTENDED_COLLECTION_ID =
    import.meta.env.VITE_APPWRITE_USERS_EXTENDED_COLLECTION_ID ||
    "users_extended"
  const TASKS_COLLECTION_ID =
    import.meta.env.VITE_APPWRITE_TASKS_COLLECTION_ID || "tasks"

  let children: UserProfile[] = []
  let isLoadingChildren = true
  let childrenError: string | null = null

  // Create task modal
  let isCreateTaskModalOpen = false

  // Task listing
  let allTasks: any[] = []
  let isLoadingTasks = false
  let tasksError: string | null = null

  // Parent name editing
  let isEditingParentName = false
  let editingParentName = ""
  let isUpdatingParentName = false
  let updateParentNameError: string | null = null

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
      }
    })
    return unsubscribe
  })

  async function fetchChildren(familyTeamId: string) {
    isLoadingChildren = true
    childrenError = null
    try {
      const response = await teams.listMemberships(familyTeamId)
      const memberUserIds = response.memberships.map((m) => m.userId)

      if (memberUserIds.length === 0) {
        children = []
        isLoadingChildren = false
        return
      }

      const userProfilesResponse = await databases.listDocuments(
        DATABASE_ID,
        USERS_EXTENDED_COLLECTION_ID,
        [Query.equal("user_id", memberUserIds)],
      )

      const allMembers: UserProfile[] = []
      for (const membership of response.memberships) {
        const appwriteUser = await teams.getMembership(
          familyTeamId,
          membership.$id,
        )
        const extendedProfile = userProfilesResponse.documents.find(
          (doc) => doc.user_id === membership.userId,
        )

        const memberName =
          extendedProfile?.name ||
          appwriteUser.userName ||
          membership.userName ||
          "Unnamed User"

        allMembers.push({
          $id: membership.userId,
          name: memberName,
          email: appwriteUser.userEmail,
          prefs: {},
          role:
            (extendedProfile?.role as "parent" | "child") ||
            (membership.roles.includes("child")
              ? "child"
              : membership.roles.includes("parent")
                ? "parent"
                : undefined),
          family_id: familyTeamId,
          $databaseId: extendedProfile?.$id,
          $collectionId: extendedProfile?.$collectionId,
        })
      }

      children = allMembers.filter((member) => member.role === "child")
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

  function startEditingParentName() {
    isEditingParentName = true
    editingParentName = $userStore.currentUser?.name || ""
    updateParentNameError = null
  }

  function cancelEditingParentName() {
    isEditingParentName = false
    editingParentName = ""
    updateParentNameError = null
  }

  async function saveParentName() {
    if (!editingParentName.trim()) {
      updateParentNameError = "Name is required."
      return
    }

    if (!$userStore.currentUser?.$databaseId) {
      updateParentNameError = "User data not found."
      return
    }

    isUpdatingParentName = true
    updateParentNameError = null

    try {
      await databases.updateDocument(
        DATABASE_ID,
        USERS_EXTENDED_COLLECTION_ID,
        $userStore.currentUser.$databaseId,
        { name: editingParentName.trim() },
      )

      await loadUser()

      isEditingParentName = false
      editingParentName = ""
    } catch (err: any) {
      console.error("Failed to update parent name:", err)
      updateParentNameError = err.message || "Failed to update name."
    } finally {
      isUpdatingParentName = false
    }
  }

  function openCreateTaskModal() {
    isCreateTaskModalOpen = true
  }

  function handleTaskCreated(event: CustomEvent) {
    // Refresh the task list when a new task is created
    fetchAllTasks()
  }

  function handleModalClose() {
    isCreateTaskModalOpen = false
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
      {#if isEditingParentName}
        <div class="parent-name-edit">
          <h2 class="text-xl font-semibold text-gray-800 mb-4">
            Edit Your Name
          </h2>
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
            Welcome, <span class="font-bold text-blue-600"
              >{$userStore.currentUser.name ||
                $userStore.currentUser.email}</span
            >!
          </p>
          <button
            type="button"
            on:click={startEditingParentName}
            class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors text-sm font-medium"
          >
            {$userStore.currentUser.name ? "Edit Name" : "Set Name"}
          </button>
        </div>
      {/if}
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
        <div class="flex justify-between items-center">
          <h2 class="text-2xl font-semibold text-gray-800">Tasks</h2>
          {#if children.length > 0}
            <button
              type="button"
              on:click={openCreateTaskModal}
              class="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-bold"
            >
              + Create Task
            </button>
          {:else}
            <p class="text-red-600 text-sm">
              <a href="/parent/family" class="text-blue-600 hover:underline"
                >Add children to your family</a
              > to create tasks
            </p>
          {/if}
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
