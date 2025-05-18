import { Client, Account, Databases } from "appwrite"

// TODO: Replace with your actual Appwrite endpoint and project ID
const APPWRITE_ENDPOINT =
  import.meta.env.PUBLIC_APPWRITE_ENDPOINT ||
  "https://YOUR_APPWRITE_ENDPOINT/v1"
const APPWRITE_PROJECT_ID =
  import.meta.env.PUBLIC_APPWRITE_PROJECT_ID || "YOUR_PROJECT_ID"

const client = new Client()
client.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID)

const account = new Account(client)
const databases = new Databases(client)

export { client, account, databases }
