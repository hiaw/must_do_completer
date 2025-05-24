<script lang="ts">
  import { onMount } from "svelte"
  import { userStore, type UserProfile, loadUser } from "$lib/stores/userStore"
  import { goto } from "$app/navigation"
  import { teams, databases, account } from "$lib/appwrite"
  import { Query, ID } from "appwrite"

  // Components
  import FamilyCreationForm from "$lib/components/FamilyCreationForm.svelte"
  import AddMemberForm from "$lib/components/AddMemberForm.svelte"
  import FamilyMembersList from "$lib/components/FamilyMembersList.svelte"
  import MemberDetailModal from "$lib/components/MemberDetailModal.svelte"
  import RemoveMemberModal from "$lib/components/RemoveMemberModal.svelte"

  // Constants
  const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || "must_dos_db"
  const USERS_EXTENDED_COLLECTION_ID =
    import.meta.env.VITE_APPWRITE_USERS_EXTENDED_COLLECTION_ID ||
    "users_extended"

  // Family data
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
            let memberEmail = "Email not available"
            if (membership.userId === $userStore.currentUser?.$id) {
              try {
                const currentUserAccount = await account.get()
                memberEmail = currentUserAccount.email
              } catch (accountError) {
                console.warn("Could not get current user email:", accountError)
              }
            }

            const newExtendedProfile = await databases.createDocument(
              DATABASE_ID,
              USERS_EXTENDED_COLLECTION_ID,
              ID.unique(),
              {
                user_id: membership.userId,
                role: membership.roles.includes("child") ? "child" : "parent",
                family_id: familyTeamId,
                name: membership.userName,
                email: memberEmail,
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
        const memberEmail =
          extendedProfile?.email ||
          appwriteUser.userEmail ||
          "No email available"

        detailedMembers.push({
          $id: membership.userId,
          name: finalName,
          email: memberEmail,
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

      familyMembers = detailedMembers
      children = familyMembers.filter((member) => member.role === "child")
    } catch (err: any) {
      console.error("Failed to fetch family members:", err)
      familyError = err.message
    } finally {
      isLoadingFamily = false
    }
  }

  // Event handlers for FamilyCreationForm
  async function handleCreateFamily(
    event: CustomEvent<{ familyName: string }>,
  ) {
    const { familyName: name } = event.detail

    if (!name.trim()) {
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
      const newTeam = await teams.create(ID.unique(), name.trim(), [
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

  // Event handlers for AddMemberForm
  function handleStartAddingMember() {
    isAddingMember = true
    newMemberEmail = ""
    newMemberName = ""
    newMemberRole = "child"
    inviteMemberError = null
    inviteMemberSuccess = null
  }

  function handleCancelAddingMember() {
    isAddingMember = false
    newMemberEmail = ""
    newMemberName = ""
    newMemberRole = "child"
    inviteMemberError = null
    inviteMemberSuccess = null
  }

  async function handleInviteMember(
    event: CustomEvent<{
      email: string
      name: string
      role: "parent" | "child"
    }>,
  ) {
    const { email, name, role } = event.detail

    if (!email.trim()) {
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
      const trimmedEmail = email.trim()
      const teamRoles = [role]
      const targetUrl = `${window.location.origin}/family/join?invitedRole=${role}`

      const newMembership = await teams.createMembership(
        $userStore.currentUser.family_id,
        teamRoles,
        trimmedEmail,
        undefined,
        undefined,
        targetUrl,
        name.trim() || undefined,
      )

      try {
        await databases.createDocument(
          DATABASE_ID,
          USERS_EXTENDED_COLLECTION_ID,
          ID.unique(),
          {
            user_id: newMembership.userId,
            role: role,
            family_id: $userStore.currentUser.family_id,
            name: name.trim() || "",
            email: trimmedEmail,
          },
        )
      } catch (createError) {
        console.warn("Failed to create users_extended document:", createError)
      }

      inviteMemberSuccess = `Invitation sent to ${trimmedEmail}${name ? ` (${name})` : ""} as ${role}!`

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

  // Event handlers for MemberDetailModal
  function handleOpenMemberDetail(event: CustomEvent<UserProfile>) {
    const member = event.detail
    selectedMember = member
    isEditingMemberName = false
    editingMemberName = member.name || ""
    updateMemberNameError = null
    isLoadingMemberDetails = true
    memberDetailError = null
    detailedMemberInfo = null

    fetchMemberDetails(member)
  }

  async function fetchMemberDetails(member: UserProfile) {
    if (!$userStore.currentUser?.family_id) {
      memberDetailError = "No family context found."
      isLoadingMemberDetails = false
      return
    }

    try {
      if (member.$id === $userStore.currentUser.$id) {
        try {
          const currentUserAccount = await account.get()
          detailedMemberInfo = {
            email: currentUserAccount.email,
            name: currentUserAccount.name,
            userId: currentUserAccount.$id,
            isCurrentUser: true,
          }
          isLoadingMemberDetails = false
          return
        } catch (accountError) {
          console.warn("Could not get current user account info:", accountError)
        }
      }

      const extendedProfile = await databases.listDocuments(
        DATABASE_ID,
        USERS_EXTENDED_COLLECTION_ID,
        [Query.equal("user_id", member.$id)],
      )

      if (extendedProfile.documents.length > 0) {
        const profile = extendedProfile.documents[0]
        detailedMemberInfo = {
          email: profile.email || "Email not available",
          name: profile.name || member.name,
          userId: member.$id,
          role: profile.role,
          isCurrentUser: false,
        }
      } else {
        detailedMemberInfo = {
          email: "Email not available",
          name: member.name || "Name not available",
          userId: member.$id,
          role: member.role,
          isCurrentUser: false,
        }
      }

      isLoadingMemberDetails = false
    } catch (error) {
      console.error("Error fetching member details:", error)
      memberDetailError = "Failed to load member details"
      isLoadingMemberDetails = false
    }
  }

  function handleCloseMemberDetail() {
    selectedMember = null
    isEditingMemberName = false
    editingMemberName = ""
    updateMemberNameError = null
    isLoadingMemberDetails = false
    memberDetailError = null
    detailedMemberInfo = null
  }

  function handleStartEditingMemberName() {
    if (!selectedMember) return
    isEditingMemberName = true
    editingMemberName = selectedMember.name || ""
    updateMemberNameError = null
  }

  function handleCancelEditingMemberName() {
    if (!selectedMember) return
    isEditingMemberName = false
    editingMemberName = selectedMember.name || ""
    updateMemberNameError = null
  }

  async function handleSaveMemberName(event: CustomEvent<{ name: string }>) {
    const { name } = event.detail

    if (!selectedMember || !name.trim()) {
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
        { name: name.trim() },
      )

      const memberIndex = familyMembers.findIndex(
        (m) => m.$id === selectedMember!.$id,
      )
      if (memberIndex !== -1) {
        familyMembers[memberIndex].name = name.trim()
        familyMembers = [...familyMembers]
        children = familyMembers.filter((member) => member.role === "child")
      }

      selectedMember!.name = name.trim()
      isEditingMemberName = false
    } catch (err: any) {
      console.error("Failed to update member name:", err)
      updateMemberNameError = err.message || "Failed to update name."
    } finally {
      isUpdatingMemberName = false
    }
  }

  // Event handlers for RemoveMemberModal
  function handleConfirmRemoveMember(member: UserProfile) {
    memberToRemove = member
    removeMemberError = null
  }

  function handleCancelRemoveMember() {
    memberToRemove = null
    removeMemberError = null
  }

  async function handleRemoveFamilyMember() {
    if (!memberToRemove || !$userStore.currentUser?.family_id) {
      removeMemberError = "Invalid member or family context."
      return
    }

    if (memberToRemove.$id === $userStore.currentUser.$id) {
      removeMemberError = "You cannot remove yourself from the family."
      return
    }

    isRemovingMember = true
    removeMemberError = null

    try {
      const memberships = await teams.listMemberships(
        $userStore.currentUser.family_id,
      )
      const membershipToRemove = memberships.memberships.find(
        (m) => m.userId === memberToRemove!.$id,
      )

      if (!membershipToRemove) {
        throw new Error("Membership not found for this user.")
      }

      await teams.deleteMembership(
        $userStore.currentUser.family_id,
        membershipToRemove.$id,
      )

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
        }
      }

      await fetchFamilyMembers($userStore.currentUser.family_id)
      memberToRemove = null

      if (selectedMember) {
        handleCloseMemberDetail()
      }
    } catch (err: any) {
      console.error("Failed to remove family member:", err)
      removeMemberError =
        err.message ||
        "An unknown error occurred while removing the family member."
    } finally {
      isRemovingMember = false
    }
  }

  function handleRemoveMemberFromModal() {
    if (!selectedMember) return
    handleConfirmRemoveMember(selectedMember)
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
        class="text-blue-600 hover:underline font-medium"
      >
        ← Back to Dashboard
      </a>
    </div>

    {#if !$userStore.currentUser.family_id}
      <FamilyCreationForm
        bind:familyName
        bind:isCreatingFamily
        bind:createFamilyError
        on:createFamily={handleCreateFamily}
      />
    {:else}
      {#if isAddingMember}
        <AddMemberForm
          bind:newMemberEmail
          bind:newMemberName
          bind:newMemberRole
          bind:isInvitingMember
          bind:inviteMemberError
          bind:inviteMemberSuccess
          on:inviteMember={handleInviteMember}
          on:cancel={handleCancelAddingMember}
        />
      {/if}

      <FamilyMembersList
        {familyMembers}
        {isLoadingFamily}
        {familyError}
        on:memberClick={handleOpenMemberDetail}
        on:addMember={handleStartAddingMember}
      />
    {/if}
  </div>
{:else}
  <p class="text-center text-gray-600">
    You do not have permission to view this page or are not logged in.
  </p>
{/if}

<!-- Modals -->
<RemoveMemberModal
  {memberToRemove}
  {isRemovingMember}
  {removeMemberError}
  on:cancel={handleCancelRemoveMember}
  on:confirm={handleRemoveFamilyMember}
/>

<MemberDetailModal
  {selectedMember}
  currentUserId={$userStore.currentUser?.$id}
  {isEditingMemberName}
  bind:editingMemberName
  {isUpdatingMemberName}
  {updateMemberNameError}
  {isLoadingMemberDetails}
  {memberDetailError}
  {detailedMemberInfo}
  on:close={handleCloseMemberDetail}
  on:startEditingName={handleStartEditingMemberName}
  on:cancelEditingName={handleCancelEditingMemberName}
  on:saveName={handleSaveMemberName}
  on:removeMember={handleRemoveMemberFromModal}
/>
