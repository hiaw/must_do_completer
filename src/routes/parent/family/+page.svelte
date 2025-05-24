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
  <p>Loading user data...</p>
{:else if $userStore.currentUser && $userStore.currentUser.role === "parent"}
  <div class="family-page">
    <div class="page-header">
      <h1>Family Management</h1>
      <a href="/parent/dashboard" class="back-link">← Back to Dashboard</a>
    </div>

    {#if !$userStore.currentUser.family_id}
      <section class="family-creation-section">
        <h2>Create Your Family Group</h2>
        <p>To start managing tasks, you need to create a family group.</p>
        <form on:submit|preventDefault={handleCreateFamily}>
          <div>
            <label for="familyName">Family Name:</label>
            <input type="text" id="familyName" bind:value={familyName} required disabled={isCreatingFamily} />
          </div>
          <button type="submit" disabled={isCreatingFamily}>
            {#if isCreatingFamily}Creating...{:else}Create Family{/if}
          </button>
          {#if createFamilyError}
            <p class="error-text">{createFamilyError}</p>
          {/if}
        </form>
      </section>
    {:else}
      <section class="family-members-section">
        <div class="section-header">
          <h2>Family Members</h2>
          {#if !isAddingChild}
            <button 
              type="button" 
              on:click={startAddingChild}
              class="add-child-btn"
            >
              + Add Child
            </button>
          {/if}
        </div>

        {#if isAddingChild}
          <div class="add-child-form">
            <h3>Invite New Child</h3>
            <div class="form-fields">
              <div>
                <label for="newChildEmail">Child's Email:</label>
                <input 
                  type="email" 
                  id="newChildEmail"
                  bind:value={newChildEmail} 
                  placeholder="child@example.com"
                  disabled={isInvitingChild}
                  required
                />
              </div>
              <div>
                <label for="newChildName">Child's Name (optional):</label>
                <input 
                  type="text" 
                  id="newChildName"
                  bind:value={newChildName} 
                  placeholder="e.g., Emma, Jake"
                  disabled={isInvitingChild}
                />
              </div>
            </div>
            <div class="edit-buttons">
              <button 
                type="button" 
                on:click={inviteChild}
                disabled={isInvitingChild}
                class="save-btn"
              >
                {#if isInvitingChild}Sending Invitation...{:else}Send Invitation{/if}
              </button>
              <button 
                type="button" 
                on:click={cancelAddingChild}
                disabled={isInvitingChild}
                class="cancel-btn"
              >
                Cancel
              </button>
            </div>
            {#if inviteChildSuccess}
              <p class="success-text">{inviteChildSuccess}</p>
            {/if}
            {#if inviteChildError}
              <p class="error-text">{inviteChildError}</p>
            {/if}
          </div>
        {/if}

        {#if isLoadingFamily}
          <p>Loading family members...</p>
        {:else if familyMembers.length > 0}
          <div class="members-grid">
            {#each familyMembers as member (member.$id)}
              <div class="member-card {member.role}">
                <div class="member-header">
                  <span class="role-badge {member.role}">{member.role}</span>
                </div>
                
                {#if member.role === "child" && editingChildId === member.$id}
                  <div class="member-edit-form">
                    <input 
                      type="text" 
                      bind:value={editingChildName} 
                      placeholder="Enter child's name"
                      disabled={isUpdatingChildName}
                      class="member-name-input"
                    />
                    <div class="edit-buttons">
                      <button 
                        type="button" 
                        on:click={saveChildName}
                        disabled={isUpdatingChildName}
                        class="save-btn"
                      >
                        {#if isUpdatingChildName}Saving...{:else}Save{/if}
                      </button>
                      <button 
                        type="button" 
                        on:click={cancelEditingChildName}
                        disabled={isUpdatingChildName}
                        class="cancel-btn"
                      >
                        Cancel
                      </button>
                    </div>
                    {#if updateNameError}
                      <p class="error-text">{updateNameError}</p>
                    {/if}
                  </div>
                {:else}
                  <div class="member-info">
                    <div class="member-details">
                      <span class="member-name">
                        {member.name || "Unnamed User"}
                      </span>
                      <span class="member-email">{member.email}</span>
                    </div>
                    {#if member.role === "child"}
                      <button 
                        type="button" 
                        on:click={() => startEditingChildName(member)}
                        class="edit-name-btn"
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
          <p class="no-members">No family members found.</p>
        {/if}
        
        {#if familyError}
          <p class="error-text">Error loading family members: {familyError}</p>
        {/if}
      </section>
    {/if}
  </div>
{:else}
  <p>You do not have permission to view this page or are not logged in.</p>
{/if}

<style>
  .family-page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid #eee;
  }

  .page-header h1 {
    margin: 0;
    color: #333;
  }

  .back-link {
    color: #007bff;
    text-decoration: none;
    font-weight: 500;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  .family-creation-section {
    background-color: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    padding: 2rem;
    text-align: center;
  }

  .family-creation-section h2 {
    color: #333;
    margin-bottom: 1rem;
  }

  .family-creation-section p {
    color: #666;
    margin-bottom: 2rem;
  }

  .family-creation-section form {
    max-width: 400px;
    margin: 0 auto;
  }

  .family-creation-section div {
    margin-bottom: 1rem;
    text-align: left;
  }

  .family-creation-section label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: bold;
  }

  .family-creation-section input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
  }

  .family-members-section {
    background-color: #fff;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  .section-header h2 {
    margin: 0;
    color: #333;
  }

  .add-child-btn {
    padding: 0.75rem 1.5rem;
    background-color: #28a745;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
  }

  .add-child-btn:hover {
    background-color: #218838;
  }

  .add-child-form {
    background-color: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    padding: 2rem;
    margin-bottom: 2rem;
  }

  .add-child-form h3 {
    margin: 0 0 1.5rem 0;
    color: #333;
  }

  .form-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .form-fields > div {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-fields label {
    font-weight: bold;
    color: #333;
  }

  .form-fields input {
    padding: 0.75rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
  }

  .members-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1.5rem;
  }

  .member-card {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1.5rem;
    background-color: #fff;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .member-card.parent {
    border-left: 4px solid #007bff;
  }

  .member-card.child {
    border-left: 4px solid #28a745;
  }

  .member-header {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 1rem;
  }

  .role-badge {
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: bold;
    text-transform: uppercase;
    color: white;
  }

  .role-badge.parent {
    background-color: #007bff;
  }

  .role-badge.child {
    background-color: #28a745;
  }

  .member-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .member-details {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .member-name {
    font-weight: bold;
    font-size: 1.1rem;
    color: #333;
  }

  .member-email {
    color: #666;
    font-size: 0.9rem;
  }

  .edit-name-btn {
    padding: 0.5rem 1rem;
    background-color: #6c757d;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .edit-name-btn:hover {
    background-color: #5a6268;
  }

  .member-edit-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .member-name-input {
    padding: 0.75rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
  }

  .edit-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .save-btn {
    padding: 0.5rem 1rem;
    background-color: #28a745;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .save-btn:hover:not(:disabled) {
    background-color: #218838;
  }

  .cancel-btn {
    padding: 0.5rem 1rem;
    background-color: #6c757d;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .cancel-btn:hover:not(:disabled) {
    background-color: #5a6268;
  }

  .error-text {
    color: #dc3545;
    font-size: 0.875rem;
    margin: 0.5rem 0 0 0;
  }

  .success-text {
    color: #28a745;
    font-size: 0.875rem;
    margin: 0.5rem 0 0 0;
    font-weight: bold;
  }

  .no-members {
    text-align: center;
    color: #888;
    font-style: italic;
    padding: 2rem;
  }

  button {
    padding: 0.75rem 1.5rem;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
  }

  button:hover:not(:disabled) {
    background-color: #0056b3;
  }

  button:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }

  @media (max-width: 768px) {
    .form-fields {
      grid-template-columns: 1fr;
    }
    
    .members-grid {
      grid-template-columns: 1fr;
    }
    
    .page-header {
      flex-direction: column;
      gap: 1rem;
      align-items: flex-start;
    }
  }
</style>

