import { Client, Account, Databases, Teams } from "appwrite"

const APPWRITE_ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT
const APPWRITE_PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID

if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID) {
  throw new Error(
    "Appwrite endpoint or project ID is not configured. " +
      "Please check your .env file and ensure VITE_APPWRITE_ENDPOINT and VITE_APPWRITE_PROJECT_ID are set, then restart your development server."
  )
}

const client = new Client()
client.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID)

const account = new Account(client)
const databases = new Databases(client)
const teams = new Teams(client)

export { client, account, databases, teams }
