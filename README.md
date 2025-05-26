# Must-Dos Completer

A family task management application built with SvelteKit and Appwrite, designed to help families organize and track recurring tasks with a points-based reward system.

## Features

- 👨‍👩‍👧‍👦 Family-based task management
- 🔄 Recurring task scheduling (daily/weekly)
- 🎯 Points-based reward system
- 👤 User roles (Parent/Child)
- 📱 Responsive design with Tailwind CSS

## Tech Stack

- **Frontend**: SvelteKit 5 with TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Appwrite
- **Deployment**: Cloudflare Pages
- **Package Manager**: Bun

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) installed
- [Appwrite](https://appwrite.io/) account and project set up

### Development

1. Clone the repository
2. Install dependencies:

   ```bash
   bun install
   ```

3. Start the development server:

   ```bash
   bun run dev
   ```

4. Open your browser to `http://localhost:5173`

## Building

To create a production version of your app:

```bash
bun run build
```

You can preview the production build with `bun run preview`.

## Deployment

This project is configured for automatic deployment to Cloudflare Pages via GitHub Actions.

📖 **See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete deployment setup instructions.**

### Quick Setup

1. Get your Cloudflare Account ID and create an API token
2. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub repository secrets
3. Push to the `main` branch - deployment happens automatically!

Your app will be available at: `https://must-dos-completer.pages.dev`

## Project Structure

```
src/
├── lib/
│   ├── types/          # TypeScript interfaces
│   └── ...
├── routes/             # SvelteKit routes
└── app.html           # HTML template
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Push to your branch and create a Pull Request

Pull requests automatically create preview deployments for testing.
