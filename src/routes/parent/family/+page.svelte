<script lang="ts">
  import { onMount } from "svelte"
  import { userStore, type UserProfile } from "$lib/stores/userStore"
  import { goto } from "$app/navigation"
  import { teams, databases } from "$lib/appwrite"
  import { Query, ID } from "appwrite"

  // Assume DATABASE_ID and USERS_EXTENDED_COLLECTION_ID are available or imported if needed
  const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || "must_dos_db"
  const USERS_EXTENDED_COLLECTION_ID =
    import.meta.env.VITE_APPWRITE_USERS_EXTENDED_COLLECTION_ID ||
    "users_extended"

  let currentFamilyId: string | null | undefined = null
  let familyMembers: UserProfile[] = [] // Similar to dashboard, but could be more detailed
  let isLoadingFamilyDetails = true
  let familyDetailsError: string | null = null

  // Invite member form
  let inviteEmail = ""
  let inviteRole: "parent" | "child" = "child"
  let isInviting = false
  let inviteError: string | null = null
  let inviteSuccess: string | null = null

  onMount(() => {
    const unsubscribe = userStore.subscribe(async (value) => {
      if (value.loading) return

      if (
        !value.currentUser ||
        value.currentUser.role !== "parent" ||
        !value.currentUser.family_id
      ) {
        goto("/login") // Or to parent dashboard if they are a parent but somehow lost family_id
      } else {
        currentFamilyId = value.currentUser.family_id
        // TODO: Fetch family name if desired (from Teams API or a 'Families' collection)
        await fetchFamilyMembersDetails(currentFamilyId)
      }
    })
    return unsubscribe
  })

  async function fetchFamilyMembersDetails(familyTeamId: string) {
    isLoadingFamilyDetails = true
    familyDetailsError = null
    try {
      const response = await teams.listMemberships(familyTeamId)
      const memberUserIds = response.memberships.map((m) => m.userId)

      if (memberUserIds.length === 0) {
        familyMembers = []
        isLoadingFamilyDetails = false
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
        ) // Could optimize by fetching all Appwrite users if possible
        const extendedProfile = userProfilesResponse.documents.find(
          (doc) => doc.user_id === membership.userId,
        )

        detailedMembers.push({
          $id: membership.userId,
          name: extendedProfile?.name || appwriteUser.userName,
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
    } catch (err: any) {
      console.error("Failed to fetch family members details:", err)
      familyDetailsError = err.message
    } finally {
      isLoadingFamilyDetails = false
    }
  }

  async function handleInviteMember() {
    if (!inviteEmail.trim() || !currentFamilyId) {
      inviteError = "Email is required and family context must be present."
      return
    }
    isInviting = true
    inviteError = null
    inviteSuccess = null

    try {
      const trimmedEmail = inviteEmail.trim()
      const teamRoles = [inviteRole]
      const targetUrl = `${window.location.origin}/family/join?invitedRole=${inviteRole}`

      console.log(
        "[handleInviteMember] Attempting to create membership with:",
        {
          teamId: currentFamilyId,
          email: trimmedEmail,
          roles: teamRoles,
          url: targetUrl,
        },
      )

      await teams.createMembership(
        currentFamilyId!,
        teamRoles,
        trimmedEmail,
        undefined,
        undefined,
        targetUrl,
      )

      inviteSuccess = `Invitation sent to ${trimmedEmail} for role ${inviteRole}.`
      inviteEmail = "" // Clear form
    } catch (err: any) {
      console.error("Failed to invite member:", err)
      inviteError =
        err.message || "An unknown error occurred while sending the invitation."
    } finally {
      isInviting = false
    }
  }
</script>

{#if $userStore.loading || (isLoadingFamilyDetails && !$userStore.currentUser?.family_id)}
  <p>Loading family details...</p>
{:else if $userStore.currentUser && $userStore.currentUser.role === "parent" && currentFamilyId}
  <h1>Family Management</h1>
  <p>Managing Family: {currentFamilyId}</p>
  <!-- Replace with family name later -->

  <section>
    <h2>Family Members</h2>
    {#if isLoadingFamilyDetails}
      <p>Loading members...</p>
    {:else if familyMembers.length > 0}
      <ul>
        {#each familyMembers as member (member.$id)}
          <li>
            {member.name || member.email} ({member.role || "N/A"})
            <!-- TODO: Add options to change role or remove member -->
          </li>
        {/each}
      </ul>
    {:else}
      <p>No members found in this family yet.</p>
    {/if}
    {#if familyDetailsError}
      <p style="color: red;">{familyDetailsError}</p>
    {/if}
  </section>

  <section>
    <h2>Invite New Member</h2>
    <form on:submit|preventDefault={handleInviteMember}>
      <div>
        <label for="inviteEmail">Email:</label>
        <input
          type="email"
          id="inviteEmail"
          bind:value={inviteEmail}
          required
          disabled={isInviting}
        />
      </div>
      <div>
        <label for="inviteRole">Role:</label>
        <select id="inviteRole" bind:value={inviteRole} disabled={isInviting}>
          <option value="child">Child</option>
          <option value="parent">Parent</option>
        </select>
      </div>
      <button type="submit" disabled={isInviting}>
        {#if isInviting}Sending Invitation...{:else}Send Invitation{/if}
      </button>
      {#if inviteSuccess}
        <p style="color: green;">{inviteSuccess}</p>
      {/if}
      {#if inviteError}
        <p style="color: red;">{inviteError}</p>
      {/if}
    </form>
  </section>
{:else}
  <p>
    You do not have permission to view this page or are not part of a family.
  </p>
{/if}

<style>
  section {
    margin-bottom: 2rem;
    padding: 1rem;
    border: 1px solid #eee;
    border-radius: 8px;
  }
  form div {
    margin-bottom: 1rem;
  }
  label {
    display: block;
    margin-bottom: 0.25rem;
  }
  input[type="email"],
  select {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-sizing: border-box;
  }
  button {
    padding: 0.75rem 1.5rem;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  button:hover {
    background-color: #0056b3;
  }
  button:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }
</style>

