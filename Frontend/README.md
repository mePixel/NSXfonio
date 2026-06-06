# React + TypeScript + Vite + shadcn/ui

This is a template for a new Vite project with React, TypeScript, and shadcn/ui.

## Environment

Copy `.env.example` to `.env` and set the backend origin:

```bash
VITE_API_URL=http://localhost:3005
```

For production, point the frontend at the API domain:

```bash
VITE_API_URL=https://api-nsxfonio.xaxa.at
```

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `src/components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button"
```
