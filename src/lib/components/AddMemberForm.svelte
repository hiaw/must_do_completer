<script lang="ts">
  import { createEventDispatcher } from "svelte"
  import { userStore } from "$lib/stores/userStore"
  import { teams, databases } from "$lib/appwrite"
  import { ID } from "appwrite"

  const dispatch = createEventDispatcher()

  // Constants
  const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || "must_dos_db"
  const USERS_EXTENDED_COLLECTION_ID =
    import.meta.env.VITE_APPWRITE_USERS_EXTENDED_COLLECTION_ID ||
    "users_extended"

  let newMemberEmail = ""
  let newMemberName = ""
  let newMemberRole: "parent" | "child" = "child"
  let isInvitingMember = false
  let inviteMemberError: string | null = null
  let inviteMemberSuccess: string | null = null

  async function handleInvite() {
    if (!newMemberEmail.trim()) {
      inviteMemberError = "Email is required."
      return
    }

    const currentUser = $userStore.currentUser
    if (!currentUser?.family_id) {
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
        currentUser.family_id,
        teamRoles,
        trimmedEmail,
        undefined,
        undefined,
        targetUrl,
        newMemberName.trim() || undefined,
      )

      try {
        await databases.createDocument(
          DATABASE_ID,
          USERS_EXTENDED_COLLECTION_ID,
          ID.unique(),
          {
            user_id: newMembership.userId,
            role: newMemberRole,
            family_id: currentUser.family_id,
            name: newMemberName.trim() || "",
            email: trimmedEmail,
          },
        )
      } catch (createError) {
        console.warn("Failed to create users_extended document:", createError)
      }

      inviteMemberSuccess = `Invitation sent to ${trimmedEmail}${newMemberName ? ` (${newMemberName})` : ""} as ${newMemberRole}!`

      // Notify parent component of successful invitation
      dispatch("memberInvited", {
        email: trimmedEmail,
        name: newMemberName.trim(),
        role: newMemberRole,
        membershipId: newMembership.$id,
      })

      // Reset form
      newMemberEmail = ""
      newMemberName = ""
      newMemberRole = "child"
    } catch (err: any) {
      console.error("Failed to invite member:", err)
      inviteMemberError =
        err.message || "An unknown error occurred while sending the invitation."
    } finally {
      isInvitingMember = false
    }
  }

  function handleCancel() {
    // Reset form and notify parent
    newMemberEmail = ""
    newMemberName = ""
    newMemberRole = "child"
    inviteMemberError = null
    inviteMemberSuccess = null
    dispatch("cancel")
  }
</script>

<div class="bg-gray-50 border border-gray-300 rounded-lg p-8 mb-8">
  <h3 class="text-xl font-semibold text-gray-800 mb-6">Invite New Member</h3>
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
    <div class="flex flex-col gap-2">
      <label for="newMemberEmail" class="font-bold text-gray-700">
        Member's Email:
      </label>
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
      <label for="newMemberName" class="font-bold text-gray-700">
        Member's Name (optional):
      </label>
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
      <label for="newMemberRole" class="font-bold text-gray-700"> Role: </label>
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
      on:click={handleInvite}
      disabled={isInvitingMember}
      class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
    >
      {#if isInvitingMember}Sending Invitation...{:else}Send Invitation{/if}
    </button>
    <button
      type="button"
      on:click={handleCancel}
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
