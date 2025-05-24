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

  // Add family member functionality
  let isAddingMember = false
  let newMemberEmail = ""
  let newMemberName = ""
  let newMemberRole: "parent" | "child" = "child"
  let isInvitingMember = false
  let inviteMemberError: string | null = null
  let inviteMemberSuccess: string | null = null

  // Remove member functionality
  let memberToRemove: UserProfile | null = null
  let isRemovingMember = false
  let removeMemberError: string | null = null

  // Member detail modal functionality
  let selectedMember: UserProfile | null = null
  let isEditingMemberName = false
  let editingMemberName = ""
  let isUpdatingMemberName = false
  let updateMemberNameError: string | null = null
  let isLoadingMemberDetails = false
  let memberDetailError: string | null = null
  let detailedMemberInfo: any = null

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

        let memberName =
          extendedProfile?.name || appwriteUser.userName || membership.userName

        if (!extendedProfile && membership.userName) {
          try {
            const newExtendedProfile = await databases.createDocument(
              DATABASE_ID,
              USERS_EXTENDED_COLLECTION_ID,
              ID.unique(),
              {
                user_id: membership.userId,
                role: membership.roles.includes("child") ? "child" : "parent",
                family_id: familyTeamId,
                name: membership.userName,
                email: appwriteUser.userEmail || "No email available",
              },
            )
            memberName = membership.userName
          } catch (createError) {
            console.warn(
              `Failed to create users_extended for ${membership.userId}:`,
              createError,
            )
          }
        }

        const teamMembershipName = appwriteUser.userName || membership.userName
        const hasExtendedProfile = !!extendedProfile
        const needsNameSync =
          teamMembershipName && hasExtendedProfile && !extendedProfile.name
        const needsEmailSync =
          hasExtendedProfile && !extendedProfile.email && appwriteUser.userEmail

        if (needsNameSync && extendedProfile) {
          try {
            await databases.updateDocument(
              DATABASE_ID,
              USERS_EXTENDED_COLLECTION_ID,
              extendedProfile.$id,
              { name: teamMembershipName },
            )
            extendedProfile.name = teamMembershipName
            memberName = teamMembershipName
          } catch (syncError) {
            console.warn(
              `Failed to sync name for user ${membership.userId}:`,
              syncError,
            )
          }
        }

        // Sync email if missing
        if (needsEmailSync && extendedProfile) {
          try {
            await databases.updateDocument(
              DATABASE_ID,
              USERS_EXTENDED_COLLECTION_ID,
              extendedProfile.$id,
              { email: appwriteUser.userEmail },
            )
            extendedProfile.email = appwriteUser.userEmail
          } catch (syncError) {
            console.warn(
              `Failed to sync email for user ${membership.userId}:`,
              syncError,
            )
          }
        }

        const finalName = memberName || "Unnamed User"

        // Try different possible email property names
        const memberEmail =
          extendedProfile?.email ||
          appwriteUser.userEmail ||
          "No email available"

        detailedMembers.push({
          $id: membership.userId,
          name: finalName,
          email: memberEmail,
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
      children = familyMembers.filter((member) => member.role === "child")
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

  function startAddingMember() {
    isAddingMember = true
    newMemberEmail = ""
    newMemberName = ""
    newMemberRole = "child"
    inviteMemberError = null
    inviteMemberSuccess = null
  }

  function cancelAddingMember() {
    isAddingMember = false
    newMemberEmail = ""
    newMemberName = ""
    newMemberRole = "child"
    inviteMemberError = null
    inviteMemberSuccess = null
  }

  async function inviteMember() {
    if (!newMemberEmail.trim()) {
      inviteMemberError = "Email is required."
      return
    }

    if (!$userStore.currentUser?.family_id) {
      inviteMemberError = "No family context found."
      return
    }

    isInvitingMember = true
    inviteMemberError = null
    inviteMemberSuccess = null

    try {
      const trimmedEmail = newMemberEmail.trim()
      const teamRoles = [newMemberRole]
      const targetUrl = `${window.location.origin}/family/join?invitedRole=${newMemberRole}`

      const newMembership = await teams.createMembership(
        $userStore.currentUser.family_id,
        teamRoles,
        trimmedEmail,
        undefined,
        undefined,
        targetUrl,
        newMemberName.trim() || undefined,
      )

      if (newMemberName.trim()) {
        try {
          await databases.createDocument(
            DATABASE_ID,
            USERS_EXTENDED_COLLECTION_ID,
            ID.unique(),
            {
              user_id: newMembership.userId,
              role: newMemberRole,
              family_id: $userStore.currentUser.family_id,
              name: newMemberName.trim(),
              email: trimmedEmail,
            },
          )
        } catch (createError) {
          console.warn("Failed to create users_extended document:", createError)
        }
      } else {
        // Even if no name is provided, create the document with email
        try {
          await databases.createDocument(
            DATABASE_ID,
            USERS_EXTENDED_COLLECTION_ID,
            ID.unique(),
            {
              user_id: newMembership.userId,
              role: newMemberRole,
              family_id: $userStore.currentUser.family_id,
              email: trimmedEmail,
            },
          )
        } catch (createError) {
          console.warn("Failed to create users_extended document:", createError)
        }
      }

      inviteMemberSuccess = `Invitation sent to ${trimmedEmail}${newMemberName ? ` (${newMemberName})` : ""} as ${newMemberRole}!`

      newMemberEmail = ""
      newMemberName = ""

      await fetchFamilyMembers($userStore.currentUser.family_id)
    } catch (err: any) {
      console.error("Failed to invite member:", err)
      inviteMemberError =
        err.message || "An unknown error occurred while sending the invitation."
    } finally {
      isInvitingMember = false
    }
  }

  function confirmRemoveMember(member: UserProfile) {
    memberToRemove = member
    removeMemberError = null
  }

  function cancelRemoveMember() {
    memberToRemove = null
    removeMemberError = null
  }

  async function removeFamilyMember() {
    if (!memberToRemove || !$userStore.currentUser?.family_id) {
      removeMemberError = "Invalid member or family context."
      return
    }

    // Prevent removing yourself
    if (memberToRemove.$id === $userStore.currentUser.$id) {
      removeMemberError = "You cannot remove yourself from the family."
      return
    }

    isRemovingMember = true
    removeMemberError = null

    try {
      // First, find the membership ID for this user
      const memberships = await teams.listMemberships(
        $userStore.currentUser.family_id,
      )
      const membershipToRemove = memberships.memberships.find(
        (m) => m.userId === memberToRemove!.$id,
      )

      if (!membershipToRemove) {
        throw new Error("Membership not found for this user.")
      }

      // Remove from team
      await teams.deleteMembership(
        $userStore.currentUser.family_id,
        membershipToRemove.$id,
      )

      // Update their users_extended document to remove family_id
      if (memberToRemove && memberToRemove.$databaseId) {
        try {
          await databases.updateDocument(
            DATABASE_ID,
            USERS_EXTENDED_COLLECTION_ID,
            memberToRemove.$databaseId,
            { family_id: null },
          )
        } catch (updateError) {
          console.warn("Failed to update users_extended document:", updateError)
          // Continue anyway since the main removal from team succeeded
        }
      }

      // Refresh the family members list
      await fetchFamilyMembers($userStore.currentUser.family_id)

      // Close the confirmation dialog
      memberToRemove = null
    } catch (err: any) {
      console.error("Failed to remove family member:", err)
      removeMemberError =
        err.message ||
        "An unknown error occurred while removing the family member."
    } finally {
      isRemovingMember = false
    }
  }

  function openMemberDetail(member: UserProfile) {
    selectedMember = member
    isEditingMemberName = false
    editingMemberName = member.name || ""
    updateMemberNameError = null
    isLoadingMemberDetails = true
    memberDetailError = null
    detailedMemberInfo = null

    // Fetch detailed member information
    fetchMemberDetails(member)
  }

  async function fetchMemberDetails(member: UserProfile) {
    if (!$userStore.currentUser?.family_id) {
      memberDetailError = "No family context found."
      isLoadingMemberDetails = false
      return
    }

    try {
      // Get the membership details which should include more user information
      const memberships = await teams.listMemberships(
        $userStore.currentUser.family_id,
      )
      const membershipData = memberships.memberships.find(
        (m) => m.userId === member.$id,
      )

      if (membershipData) {
        // Get detailed membership information
        const detailedMembership = await teams.getMembership(
          $userStore.currentUser.family_id,
          membershipData.$id,
        )
        console.log("Detailed membership info:", detailedMembership)
        detailedMemberInfo = detailedMembership
      } else {
        memberDetailError = "Member not found in team."
      }
    } catch (err: any) {
      console.error("Failed to fetch member details:", err)
      memberDetailError = err.message || "Failed to load member details."
    } finally {
      isLoadingMemberDetails = false
    }
  }

  function closeMemberDetail() {
    selectedMember = null
    isEditingMemberName = false
    editingMemberName = ""
    updateMemberNameError = null
    isLoadingMemberDetails = false
    memberDetailError = null
    detailedMemberInfo = null
  }

  function startEditingMemberName() {
    if (!selectedMember) return
    isEditingMemberName = true
    editingMemberName = selectedMember.name || ""
    updateMemberNameError = null
  }

  function cancelEditingMemberName() {
    if (!selectedMember) return
    isEditingMemberName = false
    editingMemberName = selectedMember.name || ""
    updateMemberNameError = null
  }

  async function saveMemberName() {
    if (!selectedMember || !editingMemberName.trim()) {
      updateMemberNameError = "Name is required."
      return
    }

    if (!selectedMember.$databaseId) {
      updateMemberNameError = "Member data not found."
      return
    }

    isUpdatingMemberName = true
    updateMemberNameError = null

    try {
      await databases.updateDocument(
        DATABASE_ID,
        USERS_EXTENDED_COLLECTION_ID,
        selectedMember.$databaseId,
        { name: editingMemberName.trim() },
      )

      // Update the member in the list
      const memberIndex = familyMembers.findIndex(
        (m) => m.$id === selectedMember!.$id,
      )
      if (memberIndex !== -1) {
        familyMembers[memberIndex].name = editingMemberName.trim()
        familyMembers = [...familyMembers]
        children = familyMembers.filter((member) => member.role === "child")
      }

      // Update the selected member
      selectedMember!.name = editingMemberName.trim()
      isEditingMemberName = false
    } catch (err: any) {
      console.error("Failed to update member name:", err)
      updateMemberNameError = err.message || "Failed to update name."
    } finally {
      isUpdatingMemberName = false
    }
  }

  function confirmRemoveMemberFromModal() {
    if (!selectedMember) return
    memberToRemove = selectedMember
    removeMemberError = null
    // Keep the detail modal open, the remove confirmation will overlay it
  }
</script>

{#if $userStore.loading}
  <p class="text-center text-gray-600">Loading user data...</p>
{:else if $userStore.currentUser && $userStore.currentUser.role === "parent"}
  <div class="max-w-6xl mx-auto p-8">
    <div
      class="flex justify-between items-center mb-8 pb-4 border-b-2 border-gray-200"
    >
      <h1 class="text-3xl font-bold text-gray-800">Family Management</h1>
      <a
        href="/parent/dashboard"
        class="text-blue-600 hover:underline font-medium">← Back to Dashboard</a
      >
    </div>

    {#if !$userStore.currentUser.family_id}
      <section
        class="bg-gray-50 border border-gray-300 rounded-lg p-8 text-center"
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
      <section class="bg-white">
        <div class="flex justify-between items-center mb-8">
          <h2 class="text-2xl font-semibold text-gray-800">Family Members</h2>
          {#if !isAddingMember}
            <button
              type="button"
              on:click={startAddingMember}
              class="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-bold"
            >
              + Add Member
            </button>
          {/if}
        </div>

        {#if isAddingMember}
          <div class="bg-gray-50 border border-gray-300 rounded-lg p-8 mb-8">
            <h3 class="text-xl font-semibold text-gray-800 mb-6">
              Invite New Member
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div class="flex flex-col gap-2">
                <label for="newMemberEmail" class="font-bold text-gray-700"
                  >Member's Email:</label
                >
                <input
                  type="email"
                  id="newMemberEmail"
                  bind:value={newMemberEmail}
                  placeholder="member@example.com"
                  disabled={isInvitingMember}
                  required
                  class="px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div class="flex flex-col gap-2">
                <label for="newMemberName" class="font-bold text-gray-700"
                  >Member's Name (optional):</label
                >
                <input
                  type="text"
                  id="newMemberName"
                  bind:value={newMemberName}
                  placeholder="e.g., Emma, Jake"
                  disabled={isInvitingMember}
                  class="px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div class="flex flex-col gap-2">
                <label for="newMemberRole" class="font-bold text-gray-700"
                  >Role:</label
                >
                <select
                  id="newMemberRole"
                  bind:value={newMemberRole}
                  disabled={isInvitingMember}
                  class="px-3 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="child">Child</option>
                  <option value="parent">Parent</option>
                </select>
              </div>
            </div>
            <div class="flex gap-2">
              <button
                type="button"
                on:click={inviteMember}
                disabled={isInvitingMember}
                class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {#if isInvitingMember}Sending Invitation...{:else}Send
                  Invitation{/if}
              </button>
              <button
                type="button"
                on:click={cancelAddingMember}
                disabled={isInvitingMember}
                class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
              >
                Cancel
              </button>
            </div>
            {#if inviteMemberSuccess}
              <p class="text-green-600 text-sm mt-2 font-bold">
                {inviteMemberSuccess}
              </p>
            {/if}
            {#if inviteMemberError}
              <p class="text-red-600 text-sm mt-2">{inviteMemberError}</p>
            {/if}
          </div>
        {/if}

        {#if isLoadingFamily}
          <p class="text-center text-gray-600">Loading family members...</p>
        {:else if familyMembers.length > 0}
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {#each familyMembers as member (member.$id)}
              <div
                class="border border-gray-300 rounded-lg p-6 bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer {member.role ===
                'parent'
                  ? 'border-l-4 border-l-blue-600'
                  : 'border-l-4 border-l-green-600'}"
                on:click={() => openMemberDetail(member)}
                on:keydown={(e) =>
                  e.key === "Enter" && openMemberDetail(member)}
                tabindex="0"
                role="button"
                aria-label="View details for {member.name || member.email}"
              >
                <div class="flex justify-end mb-4">
                  <span
                    class="px-3 py-1 rounded-full text-xs font-bold uppercase text-white {member.role ===
                    'parent'
                      ? 'bg-blue-600'
                      : 'bg-green-600'}"
                  >
                    {member.role}
                  </span>
                </div>

                <div class="flex flex-col gap-2">
                  <span class="font-bold text-lg text-gray-800">
                    {member.name || "Unnamed User"}
                  </span>
                  <span class="text-gray-500 text-xs mt-2"
                    >Click to view details</span
                  >
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-center text-gray-500 italic py-8">
            No family members found.
          </p>
        {/if}

        {#if familyError}
          <p class="text-red-600 text-sm mt-4">
            Error loading family members: {familyError}
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

<!-- Remove Member Confirmation Dialog -->
{#if memberToRemove}
  <div
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
  >
    <div class="bg-white rounded-lg p-8 max-w-md w-full mx-4">
      <h3 class="text-xl font-bold text-gray-800 mb-4">Remove Family Member</h3>
      <p class="text-gray-700 mb-6">
        Are you sure you want to remove <strong
          >{memberToRemove.name || memberToRemove.email}</strong
        > from your family? This action cannot be undone and they will lose access
        to all family tasks.
      </p>

      {#if removeMemberError}
        <p class="text-red-600 text-sm mb-4">{removeMemberError}</p>
      {/if}

      <div class="flex gap-4 justify-end">
        <button
          type="button"
          on:click={cancelRemoveMember}
          disabled={isRemovingMember}
          class="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          on:click={removeFamilyMember}
          disabled={isRemovingMember}
          class="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {#if isRemovingMember}Removing...{:else}Remove Member{/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Member Detail Modal -->
{#if selectedMember}
  <div
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40"
  >
    <div class="bg-white rounded-lg p-8 max-w-md w-full mx-4">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-xl font-bold text-gray-800">Member Details</h3>
        <button
          type="button"
          on:click={closeMemberDetail}
          class="text-gray-500 hover:text-gray-700 text-2xl"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div class="space-y-4 mb-6">
        <!-- Role Badge -->
        <div class="flex justify-center">
          <span
            class="px-4 py-2 rounded-full text-sm font-bold uppercase text-white {selectedMember.role ===
            'parent'
              ? 'bg-blue-600'
              : 'bg-green-600'}"
          >
            {selectedMember.role}
          </span>
        </div>

        <!-- Name Section -->
        <div class="space-y-2">
          <div class="block text-sm font-bold text-gray-700">Name:</div>
          {#if isEditingMemberName}
            <div class="space-y-2">
              <input
                type="text"
                bind:value={editingMemberName}
                placeholder="Enter member's name"
                disabled={isUpdatingMemberName}
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <div class="flex gap-2">
                <button
                  type="button"
                  on:click={saveMemberName}
                  disabled={isUpdatingMemberName}
                  class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  {#if isUpdatingMemberName}Saving...{:else}Save{/if}
                </button>
                <button
                  type="button"
                  on:click={cancelEditingMemberName}
                  disabled={isUpdatingMemberName}
                  class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
              {#if updateMemberNameError}
                <p class="text-red-600 text-sm">{updateMemberNameError}</p>
              {/if}
            </div>
          {:else}
            <div class="flex justify-between items-center">
              <span class="text-gray-800 font-medium">
                {selectedMember.name || "No name set"}
              </span>
              <button
                type="button"
                on:click={startEditingMemberName}
                class="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors text-sm"
              >
                {selectedMember.name ? "Edit" : "Set Name"}
              </button>
            </div>
          {/if}
        </div>

        <!-- Email Section -->
        <div class="space-y-2">
          <div class="block text-sm font-bold text-gray-700">Email:</div>
          {#if isLoadingMemberDetails}
            <div class="text-gray-500 text-sm">Loading...</div>
          {:else if memberDetailError}
            <div class="text-red-600 text-sm">{memberDetailError}</div>
          {:else if detailedMemberInfo}
            <span class="text-gray-800"
              >{detailedMemberInfo.userEmail ||
                detailedMemberInfo.email ||
                "No email available"}</span
            >
          {:else}
            <span class="text-gray-500">No email information available</span>
          {/if}
        </div>

        <!-- Additional Member Information -->
        {#if detailedMemberInfo && !isLoadingMemberDetails}
          <!-- Join Date -->
          {#if detailedMemberInfo.$createdAt}
            <div class="space-y-2">
              <div class="block text-sm font-bold text-gray-700">Joined:</div>
              <span class="text-gray-800 text-sm"
                >{new Date(
                  detailedMemberInfo.$createdAt,
                ).toLocaleDateString()}</span
              >
            </div>
          {/if}

          <!-- Membership Status -->
          {#if detailedMemberInfo.confirm !== undefined}
            <div class="space-y-2">
              <div class="block text-sm font-bold text-gray-700">Status:</div>
              <span class="text-gray-800 text-sm capitalize">
                {detailedMemberInfo.confirm ? "Active" : "Pending Invitation"}
              </span>
            </div>
          {/if}
        {/if}

        <!-- Member ID (for debugging/admin purposes) -->
        <div class="space-y-2">
          <div class="block text-sm font-bold text-gray-700">Member ID:</div>
          <span class="text-gray-600 text-xs font-mono"
            >{selectedMember.$id}</span
          >
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex gap-4 justify-end pt-4 border-t border-gray-200">
        <button
          type="button"
          on:click={closeMemberDetail}
          class="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
        >
          Close
        </button>
        {#if selectedMember.$id !== $userStore.currentUser?.$id}
          <button
            type="button"
            on:click={confirmRemoveMemberFromModal}
            class="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Remove Member
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
