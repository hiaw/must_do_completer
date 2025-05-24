import { Client, Databases, Query, ID } from "appwrite"
import cron from "node-cron"

// Assuming appwrite.ts exports configured client, or we configure one here
// For a server-side script, you might need to initialize the client differently
// than in your SvelteKit frontend, especially with API keys.

const APPWRITE_ENDPOINT =
  process.env.VITE_APPWRITE_ENDPOINT || "http://localhost/v1" // Or your actual endpoint
const APPWRITE_PROJECT_ID =
  process.env.VITE_APPWRITE_PROJECT_ID || "must_dos_completer" // Or your actual project ID
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY // दिस इज वेरी इंपोर्टेंट (This is very important) - Needs to be set in environment

const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || "must_dos_db"
const TASKS_COLLECTION_ID =
  process.env.VITE_APPWRITE_TASKS_COLLECTION_ID || "tasks"
const RECURRING_TASKS_COLLECTION_ID = "recurring_tasks" // As created

if (!APPWRITE_API_KEY) {
  console.error("APPWRITE_API_KEY is not set. Task scheduler cannot run.")
  // process.exit(1); // Or handle this more gracefully
}

const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID)
  .setKey(APPWRITE_API_KEY!)

const databases = new Databases(client)

/**
 * Checks active recurring tasks and generates new tasks if needed.
 */
async function generateTasksFromTemplates() {
  console.log("Running task generation job at:", new Date().toISOString())
  try {
    const activeRecurringTasks = await databases.listDocuments(
      DATABASE_ID!,
      RECURRING_TASKS_COLLECTION_ID,
      [
        Query.equal("is_active", true),
        // Add more queries if needed, e.g., start_date <= today, end_date >= today or null
      ]
    )

    for (const template of activeRecurringTasks.documents as any[]) {
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()) // Start of today

      const startDate = new Date(template.start_date)
      if (startDate > today) {
        // console.log(`Template ${template.$id} start date is in the future.`);
        continue // Not yet started
      }

      if (template.end_date) {
        const endDate = new Date(template.end_date)
        if (endDate < today) {
          // console.log(`Template ${template.$id} has ended.`);
          // Optionally, set is_active to false
          // await databases.updateDocument(DATABASE_ID, RECURRING_TASKS_COLLECTION_ID, template.$id, { is_active: false });
          continue
        }
      }

      let lastGenerated = template.last_generated_at
        ? new Date(template.last_generated_at)
        : null
      let dueDate: Date | null = null
      let shouldGenerate = false

      if (template.recurrence_type === "daily") {
        dueDate = new Date(today) // Due at the end of today
        dueDate.setHours(23, 59, 59, 999)

        if (!lastGenerated || lastGenerated < today) {
          shouldGenerate = true
        }
      } else if (template.recurrence_type === "weekly") {
        // Example: recurrence_details = "monday" (0=Sunday, 1=Monday, ...)
        const targetDay = parseInt(template.recurrence_details) // Assuming recurrence_details stores the day index (0-6)
        if (isNaN(targetDay) || targetDay < 0 || targetDay > 6) {
          console.error(
            `Invalid recurrence_details for weekly task ${template.$id}: ${template.recurrence_details}`
          )
          continue
        }

        const currentDay = today.getDay()
        const daysUntilTarget = (targetDay - currentDay + 7) % 7

        dueDate = new Date(today)
        dueDate.setDate(today.getDate() + daysUntilTarget)
        dueDate.setHours(23, 59, 59, 999) // Due at the end of the target day

        if (
          !lastGenerated ||
          lastGenerated <
            new Date(
              dueDate.getFullYear(),
              dueDate.getMonth(),
              dueDate.getDate()
            )
        ) {
          // Check if it's the correct day of the week to generate, or if a week has passed since last generation for this target day
          if (today.getDay() === targetDay) {
            // Generate only on the target day of the week
            shouldGenerate = true
          } else if (
            lastGenerated &&
            (today.getTime() - lastGenerated.getTime()) /
              (1000 * 60 * 60 * 24) >=
              7 &&
            today > lastGenerated
          ) {
            // Or if more than a week has passed and today is past the last generated day
            shouldGenerate = true
          }
        }
        // More robust weekly logic: ensure we generate for the *current* or *next* upcoming target day if a cycle was missed.
        if (!lastGenerated) {
          // If never generated, and today is the target day or past it within this week cycle, generate.
          if (today.getDay() >= targetDay) shouldGenerate = true
          // If target day is next week, it will be handled by the next run on that day.
        } else {
          const lastGeneratedCycleStart = new Date(lastGenerated)
          lastGeneratedCycleStart.setDate(
            lastGenerated.getDate() - lastGenerated.getDay() + targetDay
          ) // Find the target day of the week of the last generation
          if (lastGeneratedCycleStart < lastGenerated) {
            // If target day was earlier in that week
            lastGeneratedCycleStart.setDate(
              lastGeneratedCycleStart.getDate() + 7
            )
          }

          if (today >= lastGeneratedCycleStart) {
            shouldGenerate = true
          }
        }
      }

      if (shouldGenerate) {
        console.log(
          `Generating task for template ${template.$id} (${template.title})`
        )
        try {
          const taskData = {
            title: template.title,
            description: template.description || "",
            assigned_to_user_id: template.assigned_to_user_id,
            created_by_user_id: template.created_by_user_id,
            family_id: template.family_id,
            status: "pending",
            priority: template.priority,
            points: template.points,
            due_date: dueDate?.toISOString() || "", // Important: Appwrite expects ISO string
            // We can add a link to the recurring_task_template_id if needed
            // recurring_task_template_id: template.$id
          }

          await databases.createDocument(
            DATABASE_ID!,
            TASKS_COLLECTION_ID!,
            ID.unique(),
            taskData
          )

          await databases.updateDocument(
            DATABASE_ID!,
            RECURRING_TASKS_COLLECTION_ID,
            template.$id,
            { last_generated_at: now.toISOString() }
          )
          console.log(
            `Task ${template.title} created successfully, due: ${
              dueDate?.toISOString() || ""
            }`
          )
        } catch (error) {
          console.error(
            `Failed to create task for template ${template.$id}:`,
            error
          )
        }
      }
    }
  } catch (error) {
    console.error("Error in task generation job:", error)
  }
}

// Schedule the job
// Running every day at 1 AM, for example.
// Adjust the cron expression as needed.
// For testing, you might use '*/1 * * * *' to run every minute.

cron.schedule("0 1 * * *", generateTasksFromTemplates, {
  timezone: "UTC", // Specify timezone, or it uses server's timezone
})

console.log("Task scheduler started. Waiting for cron jobs...")

// To run this script:
// 1. Ensure APPWRITE_API_KEY, VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, VITE_APPWRITE_DATABASE_ID are in your environment.
// 2. Run `bun run must-dos-completer-sveltekit/src/lib/server/taskScheduler.ts` or `node must-dos-completer-sveltekit/src/lib/server/taskScheduler.ts`
// You might need to adjust tsconfig for node execution or use a tool like ts-node.

// A simple way to keep the script running (for testing, not for production)
// if (process.env.NODE_ENV === 'development') {
//     setInterval(() => { /* keep alive */ }, 1000 * 60 * 60);
// }

export { generateTasksFromTemplates } // Optional: if you want to trigger it manually elsewhere
