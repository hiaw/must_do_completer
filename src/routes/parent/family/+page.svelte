<script lang="ts">
  import { onMount } from "svelte"
  import { userStore, type UserProfile, loadUser } from "$lib/stores/userStore"
  import { goto } from "$app/navigation"
  import { teams, databases } from "$lib/appwrite"
  import { Query, ID } from "appwrite"

  // Assume DATABASE_ID and USERS_EXTENDED_COLLECTION_ID are available or imported if needed
  const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || "must_dos_db"
  const USERS_EXTENDED_COLLECTION_ID =
    import.meta.env.VITE_APPWRITE_USERS_EXTENDED_COLLECTION_ID ||
    "users_extended"

  let familyMembers: UserProfile[] = []
  let children: UserProfile[] = []
  let isLoadingFamily = true
  let familyError: string | null = null

  // Child name editing
  let editingChildId: string | null = null
  let editingChildName = ""
  let isUpdatingChildName = false
  let updateNameError: string | null = null

  // Add child functionality
  let isAddingChild = false
  let newChildEmail = ""
  let newChildName = ""
  let isInvitingChild = false
  let inviteChildError: string | null = null
  let inviteChildSuccess: string | null = null

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
        await fetchFamilyMembers(value.currentUser.family_id)
      }
    })
    return unsubscribe
  })

  async function fetchFamilyMembers(familyTeamId: string) {
    isLoadingFamily = true
    familyError = null
    try {
      const response = await teams.listMemberships(familyTeamId)
      const memberUserIds = response.memberships.map((m) => m.userId)

      if (memberUserIds.length === 0) {
        familyMembers = []
        children = []
        isLoadingFamily = false
        return
      }

      const userProfilesResponse = await databases.listDocuments(
        DATABASE_ID,
        USERS_EXTENDED_COLLECTION_ID,
        [Query.equal("user_id", memberUserIds)],
      )

      const detailedMembers: UserProfile[] = []
      for (const membership of response.memberships) {
        const appwriteUser = await teams.getMembership(
          familyTeamId,
          membership.$id,
        )
        const extendedProfile = userProfilesResponse.documents.find(
          (doc) => doc.user_id === membership.userId,
        )
        
        let memberName = extendedProfile?.name || appwriteUser.userName || membership.userName
        
        if (!extendedProfile && membership.userName && membership.status === "pending") {
          try {
            const newExtendedProfile = await databases.createDocument(
              DATABASE_ID,
              USERS_EXTENDED_COLLECTION_ID,
              ID.unique(),
              {
                user_id: membership.userId,
                role: membership.roles.includes("child") ? "child" : "parent",
                family_id: familyTeamId,
                name: membership.userName
              }
            )
            memberName = membership.userName
          } catch (createError) {
            console.warn(`Failed to create users_extended for ${membership.userId}:`, createError)
          }
        }
        
        const teamMembershipName = appwriteUser.userName || membership.userName
        const hasExtendedProfile = !!extendedProfile
        const needsNameSync = teamMembershipName && hasExtendedProfile && !extendedProfile.name
        
        if (needsNameSync && extendedProfile) {
          try {
            await databases.updateDocument(
              DATABASE_ID,
              USERS_EXTENDED_COLLECTION_ID,
              extendedProfile.$id,
              { name: teamMembershipName }
            )
            extendedProfile.name = teamMembershipName
            memberName = teamMembershipName
          } catch (syncError) {
            console.warn(`Failed to sync name for user ${membership.userId}:`, syncError)
          }
        }
        
        const finalName = memberName || "Unnamed User"
        
        detailedMembers.push({
          $id: membership.userId,
          name: finalName,
          email: appwriteUser.userEmail,
          prefs: {}, // Placeholder
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
          // Add team-specific roles from membership.roles if needed
        })
      }
      
      familyMembers = detailedMembers
      children = familyMembers.filter(member => member.role === "child")

    } catch (err: any) {
      console.error("Failed to fetch family members:", err)
      familyError = err.message
    } finally {
      isLoadingFamily = false
    }
  }

  async function handleCreateFamily() {
    if (!familyName.trim()) {
      createFamilyError = "Family name is required."
      return
    }
    if (!$userStore.currentUser || !$userStore.currentUser.$id || !$userStore.currentUser.$databaseId) {
      createFamilyError = "Current user data is incomplete. Cannot create family."
      return
    }

    isCreatingFamily = true
    createFamilyError = null

    try {
      const newTeam = await teams.create(ID.unique(), familyName.trim(), ["owner", "parent"])
      
      await databases.updateDocument(
        DATABASE_ID,
        USERS_EXTENDED_COLLECTION_ID,
        $userStore.currentUser.$databaseId,
        { family_id: newTeam.$id }
      )

      await loadUser()
      familyName = ""

    } catch (err: any) {
      console.error("Failed to create family:", err)
      createFamilyError = err.message || "An unknown error occurred while creating the family."
    } finally {
      isCreatingFamily = false
    }
  }

  function startEditingChildName(child: UserProfile) {
    editingChildId = child.$id
    editingChildName = child.name || ""
    updateNameError = null
  }

  function cancelEditingChildName() {
    editingChildId = null
    editingChildName = ""
    updateNameError = null
  }

  async function saveChildName() {
    if (!editingChildId || !editingChildName.trim()) {
      updateNameError = "Name is required."
      return
    }

    const child = familyMembers.find(m => m.$id === editingChildId)
    if (!child || !child.$databaseId) {
      updateNameError = "Child data not found."
      return
    }

    isUpdatingChildName = true
    updateNameError = null

    try {
      await databases.updateDocument(
        DATABASE_ID,
        USERS_EXTENDED_COLLECTION_ID,
        child.$databaseId,
        { name: editingChildName.trim() }
      )

      const childIndex = familyMembers.findIndex(m => m.$id === editingChildId)
      if (childIndex !== -1) {
        familyMembers[childIndex].name = editingChildName.trim()
        familyMembers = [...familyMembers]
        children = familyMembers.filter(member => member.role === "child")
      }

      editingChildId = null
      editingChildName = ""

    } catch (err: any) {
      console.error("Failed to update child name:", err)
      updateNameError = err.message || "Failed to update name."
    } finally {
      isUpdatingChildName = false
    }
  }

  function startAddingChild() {
    isAddingChild = true
    newChildEmail = ""
    newChildName = ""
    inviteChildError = null
    inviteChildSuccess = null
  }

  function cancelAddingChild() {
    isAddingChild = false
    newChildEmail = ""
    newChildName = ""
    inviteChildError = null
    inviteChildSuccess = null
  }

  async function inviteChild() {
    if (!newChildEmail.trim()) {
      inviteChildError = "Email is required."
      return
    }

    if (!$userStore.currentUser?.family_id) {
      inviteChildError = "No family context found."
      return
    }

    isInvitingChild = true
    inviteChildError = null
    inviteChildSuccess = null

    try {
      const trimmedEmail = newChildEmail.trim()
      const teamRoles = ["child"]
      const targetUrl = `${window.location.origin}/family/join?invitedRole=child`

      const newMembership = await teams.createMembership(
        $userStore.currentUser.family_id,
        teamRoles,
        trimmedEmail,
        undefined,
        undefined,
        targetUrl,
        newChildName.trim() || undefined
      )

      if (newChildName.trim()) {
        try {
          await databases.createDocument(
            DATABASE_ID,
            USERS_EXTENDED_COLLECTION_ID,
            ID.unique(),
            {
              user_id: newMembership.userId,
              role: "child",
              family_id: $userStore.currentUser.family_id,
              name: newChildName.trim()
            }
          )
        } catch (createError) {
          console.warn("Failed to create users_extended document:", createError)
        }
      }

      inviteChildSuccess = `Invitation sent to ${trimmedEmail}${newChildName ? ` (${newChildName})` : ""}!`
      
      newChildEmail = ""
      newChildName = ""

      await fetchFamilyMembers($userStore.currentUser.family_id)

    } catch (err: any) {
      console.error("Failed to invite child:", err)
      inviteChildError = err.message || "An unknown error occurred while sending the invitation."
    } finally {
      isInvitingChild = false
    }
  }
</script>

{#if $userStore.loading}
  <p class="text-center text-gray-600">Loading user data...</p>
{:else if $userStore.currentUser && $userStore.currentUser.role === "parent"}
  <div class="max-w-6xl mx-auto p-8">
    <div class="flex justify-between items-center mb-8 pb-4 border-b-2 border-gray-200">
      <h1 class="text-3xl font-bold text-gray-800">Family Management</h1>
      <a href="/parent/dashboard" class="text-blue-600 hover:underline font-medium">← Back to Dashboard</a>
    </div>

    {#if !$userStore.currentUser.family_id}
      <section class="bg-gray-50 border border-gray-300 rounded-lg p-8 text-center">
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
      <section class="bg-white">
        <div class="flex justify-between items-center mb-8">
          <h2 class="text-2xl font-semibold text-gray-800">Family Members</h2>
          {#if !isAddingChild}
            <button 
              type="button" 
              on:click={startAddingChild}
              class="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-bold"
            >
              + Add Child
            </button>
          {/if}
        </div>

        {#if isAddingChild}
          <div class="bg-gray-50 border border-gray-300 rounded-lg p-8 mb-8">
            <h3 class="text-xl font-semibold text-gray-800 mb-6">Invite New Child</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div class="flex flex-col gap-2">
                <label for="newChildEmail" class="font-bold text-gray-700">Child's Email:</label>
                <input 
                  type="email" 
                  id="newChildEmail"
                  bind:value={newChildEmail} 
                  placeholder="child@example.com"
                  disabled={isInvitingChild}
                  required
                  class="px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div class="flex flex-col gap-2">
                <label for="newChildName" class="font-bold text-gray-700">Child's Name (optional):</label>
                <input 
                  type="text" 
                  id="newChildName"
                  bind:value={newChildName} 
                  placeholder="e.g., Emma, Jake"
                  disabled={isInvitingChild}
                  class="px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div class="flex gap-2">
              <button 
                type="button" 
                on:click={inviteChild}
                disabled={isInvitingChild}
                class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {#if isInvitingChild}Sending Invitation...{:else}Send Invitation{/if}
              </button>
              <button 
                type="button" 
                on:click={cancelAddingChild}
                disabled={isInvitingChild}
                class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
              >
                Cancel
              </button>
            </div>
            {#if inviteChildSuccess}
              <p class="text-green-600 text-sm mt-2 font-bold">{inviteChildSuccess}</p>
            {/if}
            {#if inviteChildError}
              <p class="text-red-600 text-sm mt-2">{inviteChildError}</p>
            {/if}
          </div>
        {/if}

        {#if isLoadingFamily}
          <p class="text-center text-gray-600">Loading family members...</p>
        {:else if familyMembers.length > 0}
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {#each familyMembers as member (member.$id)}
              <div class="border border-gray-300 rounded-lg p-6 bg-white shadow-sm {member.role === 'parent' ? 'border-l-4 border-l-blue-600' : 'border-l-4 border-l-green-600'}">
                <div class="flex justify-end mb-4">
                  <span class="px-3 py-1 rounded-full text-xs font-bold uppercase text-white {member.role === 'parent' ? 'bg-blue-600' : 'bg-green-600'}">
                    {member.role}
                  </span>
                </div>
                
                {#if member.role === "child" && editingChildId === member.$id}
                  <div class="flex flex-col gap-4">
                    <input 
                      type="text" 
                      bind:value={editingChildName} 
                      placeholder="Enter child's name"
                      disabled={isUpdatingChildName}
                      class="px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <div class="flex gap-2">
                      <button 
                        type="button" 
                        on:click={saveChildName}
                        disabled={isUpdatingChildName}
                        class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
                      >
                        {#if isUpdatingChildName}Saving...{:else}Save{/if}
                      </button>
                      <button 
                        type="button" 
                        on:click={cancelEditingChildName}
                        disabled={isUpdatingChildName}
                        class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                    {#if updateNameError}
                      <p class="text-red-600 text-sm">{updateNameError}</p>
                    {/if}
                  </div>
                {:else}
                  <div class="flex justify-between items-center">
                    <div class="flex flex-col gap-2">
                      <span class="font-bold text-lg text-gray-800">
                        {member.name || "Unnamed User"}
                      </span>
                      <span class="text-gray-600 text-sm">{member.email}</span>
                    </div>
                    {#if member.role === "child"}
                      <button 
                        type="button" 
                        on:click={() => startEditingChildName(member)}
                        class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors text-sm"
                      >
                        {member.name ? "Edit Name" : "Set Name"}
                      </button>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-center text-gray-500 italic py-8">No family members found.</p>
        {/if}
        
        {#if familyError}
          <p class="text-red-600 text-sm mt-4">Error loading family members: {familyError}</p>
        {/if}
      </section>
    {/if}
  </div>
{:else}
  <p class="text-center text-gray-600">You do not have permission to view this page or are not logged in.</p>
{/if}

