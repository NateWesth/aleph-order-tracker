# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/1f9c4513-faa5-4603-ad1a-944e8d1aa5ea

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/1f9c4513-faa5-4603-ad1a-944e8d1aa5ea) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the locked dependencies without unused Node GPU downloads.
ONNXRUNTIME_NODE_INSTALL=skip npm ci

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

The web app uses browser inference for image processing, not Node CUDA/TensorRT
binaries. The flag skips only ONNX's external GPU download; other dependency
installation scripts still run. It does not disable HTTPS certificate checks.

For PowerShell, set the flag only for installation and restore its prior value:

```powershell
$previousOnnxInstall = $env:ONNXRUNTIME_NODE_INSTALL
try {
  $env:ONNXRUNTIME_NODE_INSTALL = "skip"
  npm ci
} finally {
  $env:ONNXRUNTIME_NODE_INSTALL = $previousOnnxInstall
}
```

If using Bun or pnpm to install this root web project on Linux, apply the same
command-scoped flag: `ONNXRUNTIME_NODE_INSTALL=skip bun install --frozen-lockfile`
or `ONNXRUNTIME_NODE_INSTALL=skip pnpm install --frozen-lockfile`.
Do not disable all installation scripts: Vite's native tooling still needs them.
The separate `desktop/` project requires Electron binaries and keeps its normal
installation, caching and retry steps.

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/1f9c4513-faa5-4603-ad1a-944e8d1aa5ea) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)
