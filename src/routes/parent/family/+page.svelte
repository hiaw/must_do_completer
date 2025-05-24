<script lang="ts">
  import { onMount } from "svelte"
  import { userStore, type UserProfile } from "$lib/stores/userStore"
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

  // UI state
  let isAddingMember = false
  let selectedMember: UserProfile | null = null
  let memberToRemove: UserProfile | null = null

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

            await databases.createDocument(
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

  // Event handlers for components
  function handleFamilyCreated(
    event: CustomEvent<{ familyId: string; familyName: string }>,
  ) {
    // Family creation is handled by the component, we just need to refresh
    const { familyId } = event.detail
    if (familyId) {
      fetchFamilyMembers(familyId)
    }
  }

  function handleStartAddingMember() {
    isAddingMember = true
  }

  function handleCancelAddingMember() {
    isAddingMember = false
  }

  function handleMemberInvited(
    event: CustomEvent<{
      email: string
      name: string
      role: string
      membershipId: string
    }>,
  ) {
    // Member invitation is handled by the component, we just need to refresh and close the form
    isAddingMember = false
    if ($userStore.currentUser?.family_id) {
      fetchFamilyMembers($userStore.currentUser.family_id)
    }
  }

  function handleOpenMemberDetail(event: CustomEvent<UserProfile>) {
    selectedMember = event.detail
  }

  function handleCloseMemberDetail() {
    selectedMember = null
  }

  function handleMemberUpdated(
    event: CustomEvent<{ member: UserProfile; updatedName: string }>,
  ) {
    // Update the member in our local list
    const { member, updatedName } = event.detail
    const memberIndex = familyMembers.findIndex((m) => m.$id === member.$id)
    if (memberIndex !== -1) {
      familyMembers[memberIndex].name = updatedName
      familyMembers = [...familyMembers]
      children = familyMembers.filter((member) => member.role === "child")
    }
  }

  function handleRemoveMemberRequest(event: CustomEvent<UserProfile>) {
    memberToRemove = event.detail
  }

  function handleCancelRemoveMember() {
    memberToRemove = null
  }

  function handleMemberRemoved(
    event: CustomEvent<{ removedMember: UserProfile; membershipId: string }>,
  ) {
    // Member removal is handled by the component, we just need to refresh and close modals
    memberToRemove = null
    selectedMember = null
    if ($userStore.currentUser?.family_id) {
      fetchFamilyMembers($userStore.currentUser.family_id)
    }
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
      <FamilyCreationForm on:familyCreated={handleFamilyCreated} />
    {:else}
      {#if isAddingMember}
        <AddMemberForm
          on:memberInvited={handleMemberInvited}
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
  on:cancel={handleCancelRemoveMember}
  on:memberRemoved={handleMemberRemoved}
/>

<MemberDetailModal
  {selectedMember}
  currentUserId={$userStore.currentUser?.$id}
  on:close={handleCloseMemberDetail}
  on:memberUpdated={handleMemberUpdated}
  on:removeMember={handleRemoveMemberRequest}
/>
