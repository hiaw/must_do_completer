import { Client, Account, Databases } from "appwrite"

const APPWRITE_ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT
const APPWRITE_PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID

const client = new Client()
client.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID)

const account = new Account(client)
const databases = new Databases(client)

export { client, account, databases }
